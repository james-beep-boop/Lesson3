/**
 * How long an edit-recovery capture is kept — SPEC §5: 30 days from its last write.
 *
 * ⚑ Its own module, with no imports, so the CLIENT can show the same date the server enforces.
 * `kernel.ts` imports `@payloadcms/db-postgres` and cannot be bundled into the editor, and a second
 * literal `30` in a component would be a copy that drifts the first time the retention changes.
 * `kernel.ts` re-exports this, so every existing server import keeps working.
 */
export const CAPTURE_TTL_DAYS = 30

const DAY_MS = 86_400_000

/**
 * The last day a capture written at `capturedAt` is guaranteed to exist.
 *
 * The expiry pass (`jobs/expireEditRecovery.ts`) runs nightly and retires captures untouched for
 * longer than the TTL, so a capture survives AT LEAST until this moment and is gone by the night
 * after it. Every write restarts the clock, which is why the argument is the last write, not the
 * session's start.
 */
export const captureKeptUntil = (capturedAt: Date | string | number): Date =>
  new Date(new Date(capturedAt).getTime() + CAPTURE_TTL_DAYS * DAY_MS)

/** The expiry pass's cutoff: captures untouched since this moment are retired. */
export const captureExpiryCutoff = (now: number = Date.now()): Date =>
  new Date(now - CAPTURE_TTL_DAYS * DAY_MS)
