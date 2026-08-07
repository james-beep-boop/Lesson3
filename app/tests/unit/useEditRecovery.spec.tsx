// @vitest-environment jsdom

/**
 * `useEditRecovery` — the TIMING and REQUEST-RACE behaviour.
 *
 * ⚑ Every defect pinned here survived both the protocol unit tests and a successful end-to-end run
 * in a real browser, which is the argument for this file existing. The browser run typed once,
 * waited, and watched a capture land — so it exercised precisely the one sequence that worked. What
 * it could not see: that no SECOND capture is ever scheduled, that an in-flight request's verdict is
 * discarded, or that a response from an abandoned session can install its token over a live one.
 *
 * Fake timers throughout, so an 8-second debounce costs nothing and the interleavings are
 * deterministic rather than hopeful.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

import { useEditRecovery } from '../../src/components/EditRecovery/useEditRecovery.js'
import type { UseEditRecovery } from '../../src/components/EditRecovery/useEditRecovery.js'

const CAPTURE_DEBOUNCE_MS = 8_000

const token = (revision: number) => ({
  generation: 1,
  revision,
  updatedAt: '2026-08-07T00:00:00.000Z',
})

/** A fetch stub whose per-URL behaviour each test sets. Records every call for assertions. */
type Handler = (url: string, init?: RequestInit) => Promise<Response>
let handler: Handler
let calls: { url: string; body: unknown }[]

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

/** Drives the hook from a component, exposing its latest value plus a way to change props. */
function harness(initial: { active?: boolean; modified?: boolean; versionId?: string } = {}) {
  const ref: { current: UseEditRecovery | null } = { current: null }
  const flushRef: { current: (() => Promise<void>) | null } = { current: null }
  let setProps: React.Dispatch<React.SetStateAction<Record<string, unknown>>> = () => {}
  let bumpChange: () => void = () => {}

  function Probe() {
    const [props, _setProps] = React.useState<Record<string, unknown>>({
      active: initial.active ?? true,
      modified: initial.modified ?? true,
      versionId: initial.versionId ?? 'v1',
    })
    // A fresh object each bump — exactly what Payload's form state does on every keystroke.
    const [change, setChange] = React.useState<object>({})
    setProps = _setProps
    bumpChange = () => setChange({})

    const recovery = useEditRecovery({
      versionId: props.versionId as string,
      active: props.active as boolean,
      modified: props.modified as boolean,
      changeSignal: change,
      getDocument: () => ({ lessons: [] }),
      registerFlush: (fn) => {
        flushRef.current = fn
        return () => {
          flushRef.current = null
        }
      },
    })
    ref.current = recovery

    // Mirrors `LessonControls`: the hook does not start itself, so the consumer starts a session
    // whenever the form is genuinely unlocked. Reproducing that here keeps the harness honest.
    const { start } = recovery
    const activeNow = props.active as boolean
    React.useEffect(() => {
      if (activeNow) start()
    }, [activeNow, start])

    return null
  }

  render(<Probe />)
  return {
    ref,
    flushRef,
    setProps: (p: Record<string, unknown>) => setProps((old) => ({ ...old, ...p })),
    bumpChange,
  }
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  calls = []
  handler = async (url) =>
    url.endsWith('/recovery/start')
      ? jsonResponse(200, { token: token(1) })
      : jsonResponse(200, { token: token(2) })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    return handler(String(url), init)
  })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const captureCalls = () => calls.filter((c) => c.url.endsWith('/recovery'))

describe('the capture debounce follows real edits', () => {
  /**
   * ⚑ THE DEFECT THIS FILE WAS WRITTEN FOR. The debounce originally depended on `modified`, which
   * Payload exposes as a BOOLEAN — it flips once on the first keystroke and never changes again. So
   * exactly one capture was ever scheduled per session and everything typed afterwards was silently
   * never backed up, which is the entire point of the feature.
   */
  it('schedules a SECOND capture after the first one lands', async () => {
    const h = harness()
    await flush()
    expect(calls.some((c) => c.url.endsWith('/recovery/start'))).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls()).toHaveLength(1)

    // Keep typing.
    await act(async () => {
      h.bumpChange()
    })
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls(), 'a further edit must schedule a further capture').toHaveLength(2)
  })

  it('RESTARTS the timer on each edit rather than firing mid-typing', async () => {
    const h = harness()
    await flush()

    // Three edits, each 5s apart: under a restarting 8s debounce, none should fire.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        h.bumpChange()
      })
      await act(async () => {
        vi.advanceTimersByTime(5_000)
      })
    }
    await flush()
    expect(captureCalls(), 'a debounce that does not restart would have fired').toHaveLength(0)

    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls(), 'and it fires once typing stops').toHaveLength(1)
  })

  /** Typing can begin before `start` resolves; the arriving token must schedule the first capture. */
  it('captures work typed BEFORE the session token arrived', async () => {
    let releaseStart: (r: Response) => void = () => {}
    handler = async (url) =>
      url.endsWith('/recovery/start')
        ? new Promise<Response>((resolve) => {
            releaseStart = resolve
          })
        : jsonResponse(200, { token: token(2) })

    harness()
    await flush()
    // The user types while `start` is still outstanding.
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS * 2)
    })
    expect(captureCalls()).toHaveLength(0)

    await act(async () => {
      releaseStart(jsonResponse(200, { token: token(1) }))
    })
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls(), 'the arriving token must schedule the first capture').toHaveLength(1)
  })
})

describe('prepareForSave and the in-flight capture', () => {
  /**
   * ⚑ The save originally awaited an in-flight capture and THREW ITS VERDICT AWAY, then captured
   * again. If that first write had committed with its response lost, the second used a stale token,
   * got a 409, and blocked the save — the exact outcome the tokenless fallback exists to prevent,
   * produced by the code meant to implement it.
   */
  it('uses an in-flight INDETERMINATE result and saves tokenless, without capturing again', async () => {
    let failCapture: (e: Error) => void = () => {}
    handler = async (url) =>
      url.endsWith('/recovery/start')
        ? jsonResponse(200, { token: token(1) })
        : new Promise<Response>((_resolve, reject) => {
            failCapture = reject
          })

    const h = harness()
    await flush()
    // Put a capture in flight via the debounce.
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    expect(captureCalls()).toHaveLength(1)

    let plan: Awaited<ReturnType<UseEditRecovery['prepareForSave']>> | null = null
    await act(async () => {
      const pending = h.ref.current!.prepareForSave()
      failCapture(new Error('network'))
      plan = await pending
    })

    expect(plan).toEqual({ proceed: true, token: null })
    expect(
      captureCalls(),
      'it must not fire a second capture with a possibly-stale token',
    ).toHaveLength(1)
  })

  it('an in-flight CONFLICT blocks the save without capturing again', async () => {
    let resolveCapture: (r: Response) => void = () => {}
    handler = async (url) =>
      url.endsWith('/recovery/start')
        ? jsonResponse(200, { token: token(1) })
        : new Promise<Response>((resolve) => {
            resolveCapture = resolve
          })

    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })

    let plan: Awaited<ReturnType<UseEditRecovery['prepareForSave']>> | null = null
    await act(async () => {
      const pending = h.ref.current!.prepareForSave()
      resolveCapture(jsonResponse(409, { errors: [{ message: 'stale' }] }))
      plan = await pending
    })

    expect(plan).toEqual({ proceed: false, reason: 'conflict' })
    expect(captureCalls()).toHaveLength(1)
  })
})

describe('requests from an abandoned session', () => {
  /**
   * ⚑ Clearing refs on deactivate does NOT cancel a request already in flight. Without an epoch,
   * Cancel-then-Edit lets the OLD session's `start` response install its token over the new one, and
   * every write afterwards 409s against a row the user cannot see or fix.
   */
  it('a late `start` response from a cancelled session cannot capture under the new one', async () => {
    let releaseStart: (r: Response) => void = () => {}
    let startCount = 0
    handler = async (url) => {
      if (url.endsWith('/recovery/start')) {
        startCount += 1
        if (startCount === 1) {
          return new Promise<Response>((resolve) => {
            releaseStart = resolve
          })
        }
        return jsonResponse(200, { token: token(50) })
      }
      return jsonResponse(200, { token: token(51) })
    }

    const h = harness()
    await flush()

    // Cancel, then re-enter edit mode: a new session, while the first `start` is still outstanding.
    await act(async () => {
      h.setProps({ active: false })
    })
    await flush()
    await act(async () => {
      h.setProps({ active: true })
    })
    await flush()
    // The abandoned session's response finally lands.
    await act(async () => {
      releaseStart(jsonResponse(200, { token: token(1) }))
    })
    await flush()

    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()

    const capture = captureCalls().at(-1)
    expect(capture, 'the new session should have captured').toBeTruthy()
    expect(
      capture?.body,
      'it must use the CURRENT session token, not the one that arrived late',
    ).toMatchObject({ expectedRevision: 50 })
  })
})

describe('a 429 binds every capture path, not just the debounce', () => {
  /**
   * ⚑ Backoff was previously stored in the DEBOUNCE timer, so three separate paths silently
   * cancelled the limiter's instruction: the next keystroke cleared it through the debounce cleanup,
   * the pre-expiry flush cleared it outright, and a save fired a fresh capture immediately. The
   * limiter told us how long to wait and we then hit it three different ways. It is now a deadline
   * in session state, checked inside `captureOnce`, which every entry point goes through.
   */
  const rateLimitedThenOk = () => {
    let served = 0
    handler = async (url) => {
      if (url.endsWith('/recovery/start')) return jsonResponse(200, { token: token(1) })
      served += 1
      return served === 1
        ? jsonResponse(429, { errors: [{ message: 'slow down' }] }, { 'Retry-After': '60' })
        : jsonResponse(200, { token: token(2) })
    }
  }

  /** Drive the first capture into a 429 and return the harness sitting inside the backoff. */
  const intoBackoff = async () => {
    rateLimitedThenOk()
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls()).toHaveLength(1)
    return h
  }

  it('a further EDIT does not fire a capture before the deadline', async () => {
    const h = await intoBackoff()
    await act(async () => {
      h.bumpChange()
    })
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls(), 'the edit must not cancel the backoff').toHaveLength(1)
  })

  it('a PRE-EXPIRY FLUSH does not fire a capture before the deadline', async () => {
    const h = await intoBackoff()
    await act(async () => {
      await h.flushRef.current?.()
    })
    await flush()
    expect(captureCalls(), 'the flush must respect the limiter too').toHaveLength(1)
  })

  it('a SAVE before the deadline proceeds on the held token without capturing', async () => {
    const h = await intoBackoff()
    let plan: Awaited<ReturnType<UseEditRecovery['prepareForSave']>> | null = null
    await act(async () => {
      plan = await h.ref.current!.prepareForSave()
    })
    // Definite: the server refused before storing, so what the client holds is still current.
    expect(plan).toEqual({ proceed: true, token: token(1) })
    expect(
      captureCalls(),
      'the save must not spend a request the limiter has refused',
    ).toHaveLength(1)
  })

  it('captures resume once the backoff has elapsed', async () => {
    const h = await intoBackoff()
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await flush()
    await act(async () => {
      h.bumpChange()
    })
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls().length, 'backoff must expire, not latch').toBeGreaterThan(1)
  })
})

describe('more requests from abandoned sessions', () => {
  /**
   * ⚑ The single-flight guard was cleared UNCONDITIONALLY when any capture settled. So a capture
   * belonging to a cancelled session could settle and release the guard held by the CURRENT one,
   * after which a second flush overlapped it on the same `expectedRevision` — a 409 the client
   * inflicted on itself.
   */
  it('a late capture from a cancelled session does not release the live guard', async () => {
    let releaseA: (r: Response) => void = () => {}
    let started = 0
    let captures = 0
    handler = async (url) => {
      if (url.endsWith('/recovery/start')) {
        started += 1
        return jsonResponse(200, { token: token(started === 1 ? 1 : 40) })
      }
      captures += 1
      if (captures === 1) {
        return new Promise<Response>((resolve) => {
          releaseA = resolve
        })
      }
      return new Promise<Response>(() => {}) // B's capture stays in flight
    }

    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    expect(captureCalls()).toHaveLength(1)

    // Cancel and re-enter: session B, with A's capture still outstanding.
    await act(async () => {
      h.setProps({ active: false })
    })
    await flush()
    await act(async () => {
      h.setProps({ active: true })
    })
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls(), "B's capture is now in flight").toHaveLength(2)

    // A finally settles. It must not free the slot B is holding.
    await act(async () => {
      releaseA(jsonResponse(200, { token: token(99) }))
    })
    await flush()

    // ⚑ Invoked WITHOUT awaiting. B's capture never settles in this test, so awaiting the flush would
    // await that too and hang — the assertion is about what was SENT, not about completion.
    await act(async () => {
      void h.flushRef.current?.()
    })
    await flush()
    expect(captureCalls(), "a flush must still be blocked by B's in-flight capture").toHaveLength(2)
  })

  /** A failed start from an abandoned session must not tell the LIVE session it has no backup. */
  it('a late REJECTED start does not mark the current session unavailable', async () => {
    let failA: (e: Error) => void = () => {}
    let started = 0
    handler = async (url) => {
      if (url.endsWith('/recovery/start')) {
        started += 1
        if (started === 1) {
          return new Promise<Response>((_r, reject) => {
            failA = reject
          })
        }
        return jsonResponse(200, { token: token(7) })
      }
      return jsonResponse(200, { token: token(8) })
    }

    const h = harness()
    await flush()
    await act(async () => {
      h.setProps({ active: false })
    })
    await flush()
    await act(async () => {
      h.setProps({ active: true })
    })
    await flush()
    expect(h.ref.current!.status.kind, 'session B started cleanly').toBe('idle')

    await act(async () => {
      failA(new Error('network'))
    })
    await flush()
    expect(
      h.ref.current!.status.kind,
      "the abandoned session's failure must not surface here",
    ).toBe('idle')
  })
})
