// @vitest-environment jsdom

/**
 * `useEditRecovery().keepForLater` — the "Keep for later" button (SPEC §5, 2026-10-17).
 *
 * The editor clears the screen when this resolves `kept`, so the whole contract is one property:
 * **`kept` means the server has confirmed the content that is on screen right now.** Every case here
 * is a way that could be false while something else looked successful:
 *
 *   K1  a dirty screen is captured, and `kept` carries the server's confirmed timestamp
 *   K2  a screen the server already holds is not re-sent
 *   K3  a transport failure is NOT tolerated (unlike Save, there is no other copy)
 *   K4  a 409 is reported as a conflict, not a generic failure
 *   K5  no session token (cap reached) means nothing can be kept, and nothing is sent
 *   K6  typing while the capture is in flight makes the capture stale — not kept
 *   K7  nothing is captured while a restore offer is still unanswered
 *
 * Same fake-timer and fetch-stub approach as `useEditRecovery.spec.tsx`, with a smaller harness.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

import {
  CAPTURE_DEBOUNCE_MS,
  useEditRecovery,
  type KeepResult,
  type UseEditRecovery,
} from '../../src/components/EditRecovery/useEditRecovery.js'

const STARTED = '2026-10-17T08:00:00.000Z'
const CAPTURED = '2026-10-17T09:30:00.000Z'
const token = (revision: number, updatedAt = CAPTURED) => ({ generation: 1, revision, updatedAt })

type Handler = (url: string, init?: RequestInit) => Promise<Response>
let handler: Handler
let calls: { url: string; method: string }[]

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const isStart = (url: string) => url.endsWith('/recovery/start')
const isEntryGet = (url: string, init?: RequestInit) =>
  (init?.method ?? 'GET') === 'GET' && !isStart(url)

/** Start succeeds, the entry GET finds nothing, and captures go to `capture`. */
const session =
  (capture: Handler): Handler =>
  (url, init) =>
    isStart(url)
      ? Promise.resolve(jsonResponse(200, { token: token(1, STARTED) }))
      : isEntryGet(url, init)
        ? Promise.resolve(jsonResponse(200, { capture: null }))
        : capture(url, init)

function harness() {
  const ref: { current: UseEditRecovery | null } = { current: null }
  let bumpChange: () => void = () => {}

  function Probe() {
    const [change, setChange] = React.useState<object>({})
    bumpChange = () => setChange({})
    const recovery = useEditRecovery({
      versionId: 'v1',
      active: true,
      modified: true,
      changeSignal: change,
      getDocument: () => ({ lessons: [] }),
      registerFlush: () => () => {},
    })
    ref.current = recovery
    const { start } = recovery
    React.useEffect(() => start(), [start])
    return null
  }

  render(<Probe />)
  return { ref, bump: () => act(async () => bumpChange()) }
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve()
  })
}

const captureCalls = () => calls.filter((c) => c.url.endsWith('/recovery') && c.method === 'POST')

const keep = async (h: ReturnType<typeof harness>): Promise<KeepResult> => {
  let result: KeepResult | undefined
  await act(async () => {
    result = await h.ref.current!.keepForLater()
  })
  return result!
}

beforeEach(() => {
  calls = []
  handler = session(async () => jsonResponse(200, { token: token(2) }))
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' })
    return handler(String(url), init)
  })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('keepForLater', () => {
  it('K1 captures a dirty screen and reports the CONFIRMED time', async () => {
    const h = harness()
    await settle()

    const result = await keep(h)

    expect(captureCalls()).toHaveLength(1)
    // The server's timestamp from the capture response — not the session start, not the client clock.
    expect(result).toEqual({ kind: 'kept', at: Date.parse(CAPTURED) })
  })

  it('K2 does not re-send a screen the server already holds', async () => {
    const h = harness()
    await settle()
    await act(async () => {
      vi.advanceTimersByTime(CAPTURE_DEBOUNCE_MS)
    })
    await settle()
    expect(captureCalls(), 'precondition: the debounce captured').toHaveLength(1)

    const result = await keep(h)

    expect(captureCalls(), 'nothing changed since, so nothing is sent').toHaveLength(1)
    expect(result.kind).toBe('kept')
  })

  it('K3 a transport failure is not kept — the editor must stay open', async () => {
    handler = session(async () => {
      throw new TypeError('network down')
    })
    const h = harness()
    await settle()

    expect(await keep(h)).toEqual({ kind: 'notKept', reason: 'failed' })
  })

  it('K3b a server error is not kept either', async () => {
    handler = session(async () => jsonResponse(500, {}))
    const h = harness()
    await settle()

    expect(await keep(h)).toEqual({ kind: 'notKept', reason: 'failed' })
  })

  it('K4 a 409 is reported as a conflict', async () => {
    handler = session(async () => jsonResponse(409, { errors: [{ message: 'out of date' }] }))
    const h = harness()
    await settle()

    expect(await keep(h)).toEqual({ kind: 'notKept', reason: 'conflict' })
  })

  it('K5 with no session token nothing can be kept, and nothing is sent', async () => {
    // The per-user cap: `start` refuses, so the session never holds a token.
    handler = async (url) =>
      isStart(url) ? jsonResponse(409, { reason: 'cap' }) : jsonResponse(200, { token: token(2) })
    const h = harness()
    await settle()

    expect(await keep(h)).toEqual({ kind: 'notKept', reason: 'unavailable' })
    expect(captureCalls()).toHaveLength(0)
  })

  it('K6 typing while the capture is in flight is NOT reported as kept', async () => {
    let release: (r: Response) => void = () => {}
    handler = session(() => new Promise<Response>((resolve) => (release = resolve)))
    const h = harness()
    await settle()

    let result: KeepResult | undefined
    let pending: Promise<void> = Promise.resolve()
    await act(async () => {
      pending = h.ref.current!.keepForLater().then((r) => {
        result = r
      })
    })
    // A keystroke lands after the request body was built but before the server answered.
    await h.bump()
    await act(async () => {
      release(jsonResponse(200, { token: token(2) }))
      await pending
    })

    expect(captureCalls()).toHaveLength(1)
    expect(result, 'the stored copy is older than the screen').toEqual({
      kind: 'notKept',
      reason: 'failed',
    })
  })

  it('K7 sends nothing while a restore offer is unanswered', async () => {
    handler = async (url, init) =>
      isStart(url)
        ? jsonResponse(200, { token: token(1, STARTED) })
        : isEntryGet(url, init)
          ? jsonResponse(200, {
              capture: {
                content: { 'lesson:a': { title: 'yesterday' } },
                capturedAt: STARTED,
                baseUpdatedAt: STARTED,
                schemaVersion: 'v1',
                stale: false,
                schemaMismatch: false,
              },
              token: token(1, STARTED),
            })
          : jsonResponse(200, { token: token(2) })
    const h = harness()
    await settle()
    expect(h.ref.current!.entry.phase, 'precondition: the offer is open').toBe('offer')

    expect((await keep(h)).kind).toBe('notKept')
    expect(captureCalls(), 'the unread offer must not be overwritten').toHaveLength(0)
  })
})
