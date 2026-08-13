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

import {
  CAPTURE_DEBOUNCE_MS,
  CAPTURE_TIMEOUT_MS,
  ENTRY_LOOKUP_TIMEOUT_MS,
  useEditRecovery,
} from '../../src/components/EditRecovery/useEditRecovery.js'
import type { UseEditRecovery } from '../../src/components/EditRecovery/useEditRecovery.js'

const token = (revision: number) => ({
  generation: 1,
  revision,
  updatedAt: '2026-08-07T00:00:00.000Z',
})

/** A fetch stub whose per-URL behaviour each test sets. Records every call for assertions. */
type Handler = (url: string, init?: RequestInit) => Promise<Response>
let handler: Handler
let calls: { url: string; method: string; body: unknown }[]

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

/**
 * Answer the ENTRY GET with "nothing stored", then defer to `inner` for everything else.
 *
 * ⚑ Every handler needs this. The GET shares its URL with the capture POST, and the hook suppresses
 * capture until the entry lookup resolves — so a stub that only thinks about captures hangs the whole
 * session and makes the test vacuous rather than strict. Wrapping means a future change to the entry
 * response is one edit here, not five scattered through the file.
 */
const withEntryGet =
  (inner: Handler): Handler =>
  (url, init) =>
    (init?.method ?? 'GET') === 'GET' && !url.endsWith('/recovery/start')
      ? Promise.resolve(jsonResponse(200, { capture: null }))
      : inner(url, init)

/** Drives the hook from a component, exposing its latest value plus a way to change props. */
function harness(initial: { active?: boolean; modified?: boolean; versionId?: string } = {}) {
  const ref: { current: UseEditRecovery | null } = { current: null }
  const flushRef: { current: (() => Promise<void>) | null } = { current: null }
  const safeRef: { current: (() => boolean) | null } = { current: null }
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
      registerFlush: ({ flush, isSafe }) => {
        flushRef.current = flush
        safeRef.current = isSafe
        return () => {
          flushRef.current = null
          safeRef.current = null
        }
      },
    })
    ref.current = recovery

    // Mirrors `LessonControls` exactly, INCLUDING its dependency on the version id — a different
    // version starts a new session there, so it must here.
    //
    // ⚑ That dependency is load-bearing for the tests, not decoration. Without it the harness never
    // re-started after a version change, so the new session had no token, so a stale retry timer
    // no-opped on the token check and the version-change test passed whether or not the timer had
    // been cancelled. A harness that is less faithful than the caller quietly turns a real assertion
    // into a vacuous one.
    const { start } = recovery
    const activeNow = props.active as boolean
    const versionNow = props.versionId as string
    React.useEffect(() => {
      if (activeNow && versionNow) start()
    }, [activeNow, versionNow, start])

    return null
  }

  const { unmount } = render(<Probe />)
  return {
    ref,
    flushRef,
    safeRef,
    unmount,
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
  // Tests about the OFFER replace this handler wholesale; everything else starts from "nothing
  // stored", which is what an editor opening a fresh version sees.
  handler = withEntryGet(async (url) =>
    url.endsWith('/recovery/start')
      ? jsonResponse(200, { token: token(1) })
      : jsonResponse(200, { token: token(2) }),
  )
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })
    return handler(String(url), init)
  })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/**
 * ⚑ Filtered by METHOD, not URL alone. Three verbs share `/recovery`: POST captures, GET reads the
 * stored offer on entry, DELETE discards it. Matching on the path alone counted the entry GET as a
 * capture and made every "exactly one capture" assertion in this file wrong by one.
 */
const captureCalls = () => calls.filter((c) => c.url.endsWith('/recovery') && c.method === 'POST')

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
    handler = withEntryGet(async (url) =>
      url.endsWith('/recovery/start')
        ? jsonResponse(200, { token: token(1) })
        : new Promise<Response>((_resolve, reject) => {
            failCapture = reject
          }),
    )

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
    handler = withEntryGet(async (url) =>
      url.endsWith('/recovery/start')
        ? jsonResponse(200, { token: token(1) })
        : new Promise<Response>((resolve) => {
            resolveCapture = resolve
          }),
    )

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
    // Wrapped, so the entry GET cannot consume the limiter's one refusal.
    handler = withEntryGet(async (url) => {
      if (url.endsWith('/recovery/start')) return jsonResponse(200, { token: token(1) })
      served += 1
      return served === 1
        ? jsonResponse(429, { errors: [{ message: 'slow down' }] }, { 'Retry-After': '60' })
        : jsonResponse(200, { token: token(2) })
    })
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

  /**
   * ⚑ Asserts the RETRY TIMER fires by itself, with no further edit.
   *
   * The first version of this test advanced past the deadline, then made an edit and waited out the
   * debounce — which would have produced a second request even with the retry timer deleted
   * entirely. It asserted `toBeGreaterThan(1)` and proved only that backoff does not latch forever.
   * The promise the indicator makes is "retrying in Ns", so the retry has to be automatic.
   */
  it('retries AUTOMATICALLY once the backoff elapses, with no further edit', async () => {
    await intoBackoff()
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await flush()
    expect(captureCalls(), 'the scheduled retry must fire on its own').toHaveLength(2)
  })
})

describe('a scheduled retry must not outlive its session', () => {
  /**
   * ⚑ The retry timer is the one piece of session state that survives on its own. If a session ends
   * while a 429 retry is scheduled, that timer still holds the OLD document and the OLD token — and
   * the next editor resumes the very same server row. The stale retry advances the revision under
   * it, and the capture from the editor the user is actually looking at then 409s, caused by one
   * that no longer exists.
   */
  const intoBackoffThen = async () => {
    let served = 0
    // Wrapped, so the entry GET cannot consume the limiter's one refusal.
    handler = withEntryGet(async (url) => {
      if (url.endsWith('/recovery/start')) return jsonResponse(200, { token: token(1) })
      served += 1
      return served === 1
        ? jsonResponse(429, { errors: [{ message: 'slow down' }] }, { 'Retry-After': '60' })
        : jsonResponse(200, { token: token(2) })
    })
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls()).toHaveLength(1)
    return h
  }

  it('UNMOUNTING during backoff cancels the retry', async () => {
    const h = await intoBackoffThen()
    await act(async () => {
      h.unmount()
    })
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await flush()
    expect(captureCalls(), 'a closed editor must not capture later').toHaveLength(1)
  })

  /**
   * ⚑ THERE IS NO version-change test here, and the absence is deliberate.
   *
   * A surviving retry timer is genuinely UNOBSERVABLE across a version change: the reset clears the
   * token and `retryNotBefore`, the new session starts and installs its own token, and its ordinary
   * 8-second debounce fires long before the 60-second retry — so a stale timer can only produce one
   * redundant capture of the CURRENT document with the CURRENT token, addressed to the CURRENT
   * version. Nothing about that is distinguishable from correct behaviour by count, target or
   * payload.
   *
   * `endSession()` still runs on the version-change path, because not leaking a timer is obviously
   * right and costs one call. But a test was written for it, passed against the defect, and was
   * deleted rather than kept — a green test that cannot fail is worse than no test, because it
   * reports coverage that does not exist.
   */
  /**
   * ⚑ This one asserts the PROPERTY, not the mechanism, and says so because it does not discriminate
   * between them. Three separate guards independently prevent a capture here — the session reset
   * nulls the token, `run()` checks `live.current.active`, and the timer is cancelled — so no single
   * mutation makes it fail. It is kept because "a locked form never captures" is worth pinning
   * whatever enforces it; it is NOT evidence that the timer cancellation works. Only the unmount
   * test above is that.
   */
  it('leaving EDIT MODE during backoff sends no further capture', async () => {
    const h = await intoBackoffThen()
    await act(async () => {
      h.setProps({ active: false })
    })
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await flush()
    expect(captureCalls(), 'a locked form must not capture later').toHaveLength(1)
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
    handler = withEntryGet(async (url) => {
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
    })

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

/**
 * ENTRY — what a just-opened editor finds waiting for it, and the lock that depends on the answer.
 *
 * ⚑ The form stays LOCKED through `resolving`, and `LessonControls` derives that lock directly from
 * `entry.phase`. So an entry that never leaves `resolving` is not a slow prompt — it is an editor
 * nobody can type into. Every branch below therefore asserts the phase it settles on, including the
 * failure branches, because "unlock anyway" is the correct answer to a failed lookup and the easy
 * thing to get wrong is leaving the user locked out of their own document.
 */
// ⚑ A REAL capture-map key (`<scope>:<rowId>`, see `projectCapture`), not a field path. The restore
// prompt decodes it to attribute prose to a lesson, so a made-up key shape here would let a decoding
// bug through.
const storedCapture = (over: Record<string, unknown> = {}) => ({
  content: { 'lesson:0b6f1e2a': { overview: 'work from before' } },
  // The CAPTURE's own mtime, sent by the endpoint alongside — and distinct from — the source
  // version's `baseUpdatedAt` below.
  capturedAt: '2026-08-07T12:00:00.000Z',
  baseUpdatedAt: '2026-08-07T00:00:00.000Z',
  schemaVersion: 'sv-1',
  stale: false,
  schemaMismatch: false,
  ...over,
})

/**
 * Serve `start`, then answer the entry GET with whatever this case is about.
 *
 * ⚑ Module scope, so every block can reach it. The later blocks could not, and each grew its own
 * near-copy — with small drifts (a different capture key, no DELETE arm) that read as if they were
 * meaningful. One offer fixture per file.
 */
const offering = (body: unknown, status = 200) => {
  handler = async (url, init) => {
    if (url.endsWith('/recovery/start')) return jsonResponse(200, { token: token(1) })
    if ((init?.method ?? 'GET') === 'GET') return jsonResponse(status, body)
    if (init?.method === 'DELETE') return jsonResponse(200, {})
    return jsonResponse(200, { token: token(2) })
  }
}

describe('the entry state machine', () => {
  it('offers a stored capture, and asks for it only AFTER start', async () => {
    offering({ capture: storedCapture() })
    const h = harness()
    await flush()

    expect(h.ref.current!.entry.phase).toBe('offer')

    // ⚑ Order, not merely presence. `start` is the only path that creates or reactivates the row, so
    // a GET that overtook it would be answered "nothing stored" for a session that has a capture —
    // and the teacher would be shown an empty editor with their work sitting on the server.
    const seq = calls.map((c) => `${c.method} ${c.url.replace(/^.*versions\/[^/]+/, '')}`)
    expect(seq.indexOf('POST /recovery/start')).toBeLessThan(seq.indexOf('GET /recovery'))
  })

  /**
   * ⚑ `start` has just created the row, so an active capture with NO content is the normal shape of a
   * brand-new session — not an offer. Treating "a row exists" as the test would prompt every editor,
   * every time, with nothing in the panel.
   */
  it('does NOT offer a freshly started row with null content', async () => {
    offering({ capture: storedCapture({ content: null }) })
    const h = harness()
    await flush()

    expect(h.ref.current!.entry.phase).toBe('clear')
  })

  /**
   * ⚑ CAPTURE time and SOURCE time are different facts and must stay apart. `capturedAt` is the
   * recovery row's own mtime and is what the prompt shows; `baseUpdatedAt` is the source version's,
   * and exists only for the staleness comparison. An early build printed the latter under
   * "Captured …" and told a teacher their afternoon's work dated from whenever the lesson plan was
   * last saved. Browser-verified 2026-08-07, and pinned here so the two cannot be confused again.
   */
  it('carries the capture time and the source mtime as separate values', async () => {
    offering({
      capture: storedCapture({
        capturedAt: '2026-08-07T15:30:00.000Z',
        baseUpdatedAt: '2026-08-02T09:00:00.000Z',
      }),
    })
    const h = harness()
    await flush()

    const entry = h.ref.current!.entry
    expect(entry.phase === 'offer' && entry.capture.capturedAt).toBe('2026-08-07T15:30:00.000Z')
    expect(
      entry.phase === 'offer' && entry.capture.baseUpdatedAt,
      'the source mtime is still carried, for the staleness comparison',
    ).toBe('2026-08-02T09:00:00.000Z')
  })

  /**
   * ⚑ A capture we cannot DATE is not offered. The panel's "Captured …" line is the whole reason
   * `capturedAt` exists; without it the only date to hand is `baseUpdatedAt`, which would reinstate
   * the exact lie the field was added to remove — and only under a malformed response, where nobody
   * would look.
   */
  it('refuses a capture that arrives without its timestamp', async () => {
    const { capturedAt: _dropped, ...undatable } = storedCapture()
    offering({ capture: undatable })
    const h = harness()
    await flush()

    expect(h.ref.current!.entry.phase).toBe('clear')
  })

  it('does not offer when there is nothing stored', async () => {
    offering({ capture: null })
    const h = harness()
    await flush()

    expect(h.ref.current!.entry.phase).toBe('clear')
  })

  it.each([
    ['stale', { stale: true }],
    ['schema-mismatched', { schemaMismatch: true }],
  ])('offers a %s capture as READ-ONLY', async (_label, over) => {
    offering({ capture: storedCapture(over) })
    const h = harness()
    await flush()

    const entry = h.ref.current!.entry
    expect(entry.phase).toBe('offer')
    // The flag the prompt uses to withhold the Restore button entirely. Applying either kind could
    // land prose on the wrong row, so this is the difference between recovery and corruption.
    expect(entry.phase === 'offer' && entry.readOnly).toBe(true)
  })

  /**
   * ⚑ UNLOCK on a failed lookup. Refusing to let someone edit because we could not check for a
   * backup is a strictly worse failure than not offering them one.
   */
  it('unlocks when the entry GET fails', async () => {
    offering({ errors: [{ message: 'nope' }] }, 500)
    const h = harness()
    await flush()

    expect(h.ref.current!.entry.phase).toBe('clear')
  })

  it('keeping the offer unlocks and leaves the capture alone', async () => {
    offering({ capture: storedCapture() })
    const h = harness()
    await flush()
    await act(async () => {
      h.ref.current!.keepOffer()
    })

    expect(h.ref.current!.entry.phase).toBe('clear')
    expect(
      calls.some((c) => c.method === 'DELETE'),
      'Not now must not destroy it',
    ).toBe(false)
  })

  it('discarding retires the capture with the held token', async () => {
    offering({ capture: storedCapture() })
    const h = harness()
    await flush()
    await act(async () => {
      await h.ref.current!.discardOffer()
    })

    expect(h.ref.current!.entry.phase).toBe('clear')
    const del = calls.find((c) => c.method === 'DELETE')
    expect(del?.body).toEqual({ generation: 1, expectedRevision: 1 })
  })

  /**
   * ⚑ **A DISCARD MUST RESTART THE SESSION, or recovery is dead for the rest of it.**
   *
   * `retire` sets `retired_at`; `capture` requires `retired_at IS NULL`. So after a discard the row is
   * dormant and every later capture 409s — the teacher declines yesterday's work and, without a word,
   * today's stops being backed up. Adopting the token the DELETE returns does not help: the token is
   * fine, the ROW is retired. Only `start` reactivates it.
   *
   * The original case-8 browser test could not see this, because it stopped at the discard. This
   * carries on to the thing the user does next.
   */
  it('discarding RESTARTS the session, so the next capture still works', async () => {
    offering({ capture: storedCapture() })
    const h = harness()
    await flush()
    const startsBefore = calls.filter((c) => c.url.endsWith('/recovery/start')).length

    await act(async () => {
      await h.ref.current!.discardOffer()
    })
    await flush()

    expect(
      calls.filter((c) => c.url.endsWith('/recovery/start')).length,
      'the retired row must be reactivated',
    ).toBe(startsBefore + 1)

    // And the session is usable again: an edit still produces a capture.
    const capturesBefore = captureCalls().length
    await act(async () => {
      h.bumpChange()
    })
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls().length, 'work typed after a discard must still be backed up').toBe(
      capturesBefore + 1,
    )
  })

  /**
   * ⚑ The restart runs even when the DELETE FAILED. A discard whose response was lost may well have
   * committed, and `start` on a live row is a harmless resume — so attempting it is strictly safer
   * than assuming the row survived.
   */
  it('restarts even when the retire request fails', async () => {
    offering({ capture: storedCapture() })
    const priorHandler = handler
    handler = async (url, init) => {
      if (init?.method === 'DELETE') return jsonResponse(500, { errors: [{ message: 'boom' }] })
      return priorHandler(url, init)
    }
    const h = harness()
    await flush()
    const startsBefore = calls.filter((c) => c.url.endsWith('/recovery/start')).length

    await act(async () => {
      await h.ref.current!.discardOffer()
    })
    await flush()

    expect(calls.filter((c) => c.url.endsWith('/recovery/start')).length).toBe(startsBefore + 1)
  })

  /**
   * ⚑ The user asked to get on with editing. Holding the form hostage to a tidy-up they did not ask
   * about would be the wrong trade, and a capture that survives is retired by the 30-day pass anyway.
   */
  it('discarding unlocks even when the retire request fails', async () => {
    offering({ capture: storedCapture() })
    const priorHandler = handler
    handler = async (url, init) => {
      if (init?.method === 'DELETE') throw new Error('offline')
      return priorHandler(url, init)
    }
    const h = harness()
    await flush()
    await act(async () => {
      await h.ref.current!.discardOffer()
    })

    expect(h.ref.current!.entry.phase).toBe('clear')
  })

  /** Leaving edit mode with a prompt open must not leave the next unlock holding a dead offer. */
  it('clears the offer when the session ends', async () => {
    offering({ capture: storedCapture() })
    const h = harness()
    await flush()
    expect(h.ref.current!.entry.phase).toBe('offer')

    await act(async () => {
      h.setProps({ active: false })
    })
    await flush()

    expect(h.ref.current!.entry.phase).toBe('idle')
  })
})

/**
 * The SAFETY PROBE — the synchronous answer `IdleLogout` destroys work on.
 *
 * ⚑ It exists because a remembered flush verdict is stale by construction: a capture that succeeded
 * 29 seconds before the session deadline says nothing about text typed two seconds before it, and the
 * 8-second debounce cannot land in that gap. The probe is evaluated at the moment of the decision and
 * compares CONTENT, not the fate of the last request.
 */
describe('the safety probe', () => {
  const safe = (h: ReturnType<typeof harness>) => h.safeRef.current!()

  it('is safe when nothing is dirty', async () => {
    const h = harness({ modified: false })
    await flush()
    expect(safe(h)).toBe(true)
  })

  it('is UNSAFE while dirty work has never been captured', async () => {
    const h = harness()
    await flush()
    expect(safe(h)).toBe(false)
  })

  it('becomes safe once the server confirms that exact content', async () => {
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(captureCalls()).toHaveLength(1)
    expect(safe(h)).toBe(true)
  })

  /**
   * ⚑ The stale-verdict case, at its source. The capture SUCCEEDED — a `runAll` result would say
   * "safe" — and then the teacher typed. The probe reports the truth because it compares the content
   * on screen against the content the server confirmed, not against whether a request went well.
   */
  it('goes UNSAFE again the moment the content changes after a successful capture', async () => {
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(safe(h), 'precondition: the capture landed').toBe(true)

    await act(async () => {
      h.bumpChange()
    })
    expect(safe(h), 'a keystroke the debounce has not reached is not backed up').toBe(false)
  })

  /**
   * ⚑ An edit made WHILE a capture is in flight. The request carries the OLD content, so its success
   * says nothing about what is now on screen. This is why the signal is snapshotted when the body is
   * built rather than when the response lands — the other ordering marks content safe that was never
   * sent.
   */
  it('does not credit a capture for content typed after its body was built', async () => {
    let release: (r: Response) => void = () => {}
    handler = withEntryGet(async (url) =>
      url.endsWith('/recovery/start')
        ? jsonResponse(200, { token: token(1) })
        : new Promise<Response>((resolve) => {
            release = resolve
          }),
    )

    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    expect(captureCalls()).toHaveLength(1)

    // Type while it is in flight, THEN let it succeed.
    await act(async () => {
      h.bumpChange()
    })
    await act(async () => {
      release(jsonResponse(200, { token: token(2) }))
    })
    await flush()

    expect(safe(h), 'the in-flight request never carried this text').toBe(false)
  })

  /**
   * ⚑ The probe also SHORT-CIRCUITS the pre-expiry flush. `runAll` fires on every tick inside the
   * 90-second window — three or more times, plus once per focus and visibilitychange — and `modified`
   * cannot stop the repeats, because it is Payload's touched flag: it flips once and never clears.
   * Without this, each redundant tick re-serialised the whole bundle, uploaded it, and advanced the
   * revision server-side, to store bytes the server already had.
   */
  it('a flush sends nothing when the server already has this content', async () => {
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    const afterFirst = captureCalls().length
    expect(afterFirst).toBe(1)

    // Three flushes, as the pre-expiry window would produce, with nothing typed in between.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await h.flushRef.current?.()
      })
    }
    await flush()
    expect(captureCalls().length, 'already-stored content must not be re-sent').toBe(afterFirst)
  })

  /** And it still sends when there IS something new — the skip must not swallow a real flush. */
  it('a flush still sends when the content has changed since the last capture', async () => {
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    const afterFirst = captureCalls().length

    await act(async () => {
      h.bumpChange()
    })
    await act(async () => {
      await h.flushRef.current?.()
    })
    await flush()
    expect(captureCalls().length).toBe(afterFirst + 1)
  })

  it('is safe again after the next capture catches up', async () => {
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    await act(async () => {
      h.bumpChange()
    })
    expect(safe(h)).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    expect(safe(h)).toBe(true)
  })
})

/**
 * Two refusals that look identical to `captureOnce` but must not look identical to the TEACHER.
 */
describe('what the indicator is allowed to blame', () => {
  /**
   * ⚑ The entry gate refuses captures ON PURPOSE while an offer is unresolved. `captureOnce` reports
   * that with the same `rejected` outcome a server refusal produces, and `statusForOutcome` paints
   * that as "NOT backed up: could not reach the server" — so a debounce tick landing during the offer
   * told the teacher their work was not being saved when nothing had gone wrong, while a modal sat in
   * front of them. Reachable because fields are NOT read-only while an offer is open.
   */
  it('says nothing when the entry gate suppressed the capture', async () => {
    offering({ capture: storedCapture() })
    const h = harness()
    await flush()
    expect(h.ref.current!.entry.phase, 'precondition: an offer is open').toBe('offer')
    const before = h.ref.current!.status.kind

    // Type, and let the debounce fire straight into the gate.
    await act(async () => {
      h.bumpChange()
    })
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()

    expect(captureCalls(), 'the gate still refuses the capture').toHaveLength(0)
    expect(
      h.ref.current!.status.kind,
      'a refusal we chose must not be reported as a backup failure',
    ).toBe(before)
  })

  /**
   * ⚑ A capture that never settles used to hold `inFlight` forever — no later capture could run, and
   * `prepareForSave` awaits it, so the teacher's SAVE hung with it. The feature would have been
   * blocking the operation it exists to protect. An abandoned capture is `indeterminate`, which
   * `planSave` already handles by saving tokenless.
   */
  it('abandons a capture that never answers, and lets the save through', async () => {
    // ⚑ The stub must HONOUR the abort signal. A promise that simply never settles ignores
    // `AbortController`, so the test would hang on its own fake rather than exercise the bound —
    // real `fetch` rejects with an AbortError, and that rejection is what `captureOnce` classifies
    // as indeterminate.
    handler = withEntryGet((url, init) =>
      url.endsWith('/recovery/start')
        ? Promise.resolve(jsonResponse(200, { token: token(1) }))
        : new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
    )
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    expect(captureCalls()).toHaveLength(1)

    // The save must not wait on it for longer than the capture's own bound.
    let plan: Awaited<ReturnType<UseEditRecovery['prepareForSave']>> | null = null
    await act(async () => {
      const pending = h.ref.current!.prepareForSave()
      vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS + 1_000)
      plan = await pending
    })

    expect(plan, 'a save is never blocked by a stalled BACKUP').toEqual({
      proceed: true,
      token: null,
    })
  })
})

/**
 * The request bounds, and the half of them that was missing.
 */
describe('every recovery request is bounded', () => {
  /**
   * ⚑ THE HALF THAT WAS MISSING. `fetch` resolves on HEADERS, so clearing the deadline around the
   * fetch alone leaves `await res.json()` unbounded — and a stalled BODY reproduces the entire
   * failure the deadline exists to prevent: `inFlight` is held forever, no later capture runs, and
   * `prepareForSave` waits on it. The bound has to span the parse.
   */
  it('abandons a capture whose BODY never arrives, not just its headers', async () => {
    handler = withEntryGet((url, init) =>
      url.endsWith('/recovery/start')
        ? Promise.resolve(jsonResponse(200, { token: token(1) }))
        : // Headers arrive immediately; the body never does, and aborts when the deadline fires.
          Promise.resolve({
            status: 200,
            headers: new Headers(),
            json: () =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () =>
                  reject(new DOMException('Aborted', 'AbortError')),
                )
              }),
          } as unknown as Response),
    )

    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    expect(captureCalls()).toHaveLength(1)

    let plan: Awaited<ReturnType<UseEditRecovery['prepareForSave']>> | null = null
    await act(async () => {
      const pending = h.ref.current!.prepareForSave()
      vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS + 1_000)
      plan = await pending
    })

    expect(plan, 'a save is never blocked by a stalled response body').toEqual({
      proceed: true,
      token: null,
    })
  })

  /**
   * ⚑ A `start` that never settles leaves `ready` false, so the debounce schedules nothing and the
   * session takes NO backups — silently, with the indicator sitting on "starting". It had no bound at
   * all until the other three did.
   */
  it('abandons a start that never answers', async () => {
    handler = (url, init) =>
      url.endsWith('/recovery/start')
        ? new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          })
        : Promise.resolve(jsonResponse(200, { capture: null }))

    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(ENTRY_LOOKUP_TIMEOUT_MS + 1_000)
    })
    // The abort has to travel: listener → stub rejection → `withDeadline`'s finally → `requestStart`
    // → `start`'s catch. Two microtask turns is not enough.
    await flush()
    await flush()
    await flush()

    // It gives up and SAYS so, rather than sitting on "starting" for the rest of the session.
    expect(h.ref.current!.status.kind).toBe('unavailable')
    expect(h.ref.current!.entry.phase, 'and the editor is not left waiting on an offer').toBe(
      'clear',
    )
  })
})

/**
 * ⚑ The blur and visibilitychange flushes re-sent content the server already had. `modified` cannot
 * stop them — it is Payload's touched flag, which flips once and never clears — so every alt-tab
 * during an editing session re-serialised the whole document, uploaded it, advanced the revision and
 * spent rate-limit budget to store bytes already stored.
 */
describe('nothing is re-sent that the server already has', () => {
  it('a blur after a confirmed capture sends nothing', async () => {
    harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    const afterFirst = captureCalls().length
    expect(afterFirst).toBe(1)

    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        window.dispatchEvent(new Event('blur'))
      })
      await flush()
    }
    expect(captureCalls().length, 'already-stored content must not be re-sent').toBe(afterFirst)
  })

  it('but a blur after an EDIT still sends', async () => {
    const h = harness()
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await flush()
    const afterFirst = captureCalls().length

    await act(async () => {
      h.bumpChange()
    })
    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })
    await flush()
    expect(captureCalls().length).toBe(afterFirst + 1)
  })
})
