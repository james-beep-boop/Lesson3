/**
 * Run `work` under a deadline: abort it, AND stop waiting for it, if the deadline passes.
 *
 * Shared by the edit-recovery requests (`useEditRecovery`) and the delete confirmations' draft
 * warning (`unsavedWarning`) — both are awaited by something the teacher is waiting on (a capture
 * holds `inFlight`, which Save awaits; the warning is awaited with the form locked), so neither may
 * be allowed to wait forever.
 *
 * ⚑ **ABORT AND RACE, not abort alone** (2026-10-17). Aborting releases a request that honours its
 * signal; racing holds the bound for one that does not — a stub, a polyfill, or a body stream that
 * ignores the abort. On timeout the returned promise REJECTS with {@link DeadlineExceeded}, which
 * every caller already handles the way it handles an aborted request.
 *
 * ⚑ **The bound spans the BODY READ, not just the headers.** `fetch` resolves as soon as headers
 * arrive, so a deadline around the `fetch` alone leaves `await res.json()` unbounded. Callers do the
 * fetch AND the parse inside `work`.
 *
 * ⚑ Hand-rolled rather than `AbortSignal.timeout(ms)` (which `generator/docxToPdf.ts` uses
 * server-side). Node implements that timer natively rather than through `globalThis.setTimeout`, so
 * vitest's fake timers cannot drive it — and the tests prove these bounds by advancing fake time.
 */
export class DeadlineExceeded extends Error {
  constructor(ms: number) {
    super(`gave up after ${ms}ms`)
    this.name = 'DeadlineExceeded'
  }
}

export const withDeadline = async <T>(
  ms: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const giveUp = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      giveUp.abort()
      reject(new DeadlineExceeded(ms))
    }, ms)
  })
  const running = work(giveUp.signal)
  // The loser of the race settles unobserved; it must not surface as an unhandled rejection.
  running.catch(() => undefined)
  try {
    // `await` inside the try, deliberately: returning the un-awaited race would clear the timer
    // immediately and leave the work unbounded again.
    return await Promise.race([running, expired])
  } finally {
    clearTimeout(timer)
  }
}
