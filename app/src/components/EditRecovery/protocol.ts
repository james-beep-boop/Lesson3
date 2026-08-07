/**
 * Edit-recovery client protocol — the DECISIONS, as pure functions.
 *
 * Separated from `useEditRecovery` so the branching can be unit tested without React, a DOM or a
 * server. The hook owns timers, refs and fetch; this file owns "given what came back, what does that
 * mean" — which is where the protocol is actually easy to get wrong.
 */

/** What every advancing write returns and the client must adopt (design §4's token rule). */
export type RecoveryToken = { generation: number; revision: number; updatedAt: string }

/**
 * The outcome of one capture attempt, classified by **what the server did**, not by what it said.
 *
 * ⚑ The `definite` / `indeterminate` split is the whole point, and it is not cosmetic. A save that
 * follows a capture has to decide which token to send, and that depends entirely on whether the
 * capture COMMITTED:
 *
 *   - `ok`            — committed; adopt the advanced token.
 *   - `conflict`      — did not commit, and another writer holds newer work. Never save through this.
 *   - `definite`      — did not commit (the server rejected it before doing anything). The token the
 *                       client holds is still current, so a save may use it.
 *   - `indeterminate` — UNKNOWABLE. The request may have committed and the response been lost. The
 *                       held token may already be stale, so saving with it would 409 — which is why
 *                       the save path drops the token entirely rather than gambling.
 */
export type CaptureOutcome =
  | { kind: 'ok'; token: RecoveryToken }
  | { kind: 'conflict' }
  | { kind: 'definite'; reason: 'tooLarge' | 'rateLimited' | 'rejected'; retryAfterSec?: number }
  | { kind: 'indeterminate' }

/**
 * Classify an HTTP response.
 *
 * ⚑ 4xx is DEFINITE and 5xx is INDETERMINATE, and that asymmetry is deliberate. A 4xx is the server
 * declining before it acted — a validation or precondition refusal, so nothing was written. A 5xx may
 * be a failure *after* the write committed (a crash while serialising the response, a proxy timeout),
 * so the client cannot conclude the capture did not land. Treating 5xx as definite would send a token
 * the server has already superseded, and the save would 409 for a reason the user cannot act on.
 */
export const classifyResponse = (
  status: number,
  body: { token?: RecoveryToken } | null,
  retryAfterHeader?: string | null,
): CaptureOutcome => {
  if (status === 200 && body?.token) return { kind: 'ok', token: body.token }
  if (status === 409) return { kind: 'conflict' }
  if (status === 413) return { kind: 'definite', reason: 'tooLarge' }
  if (status === 429) {
    const parsed = Number(retryAfterHeader)
    return {
      kind: 'definite',
      reason: 'rateLimited',
      // A missing or junk `Retry-After` must not become `NaN` in a `setTimeout`, which fires
      // immediately and turns backoff into a hot loop against a limiter that is already refusing us.
      retryAfterSec: Number.isFinite(parsed) && parsed > 0 ? parsed : 30,
    }
  }
  // A 200 with no token is a broken server contract, not a success — treat it as indeterminate
  // rather than adopting `undefined` as a token.
  if (status >= 500 || status === 200) return { kind: 'indeterminate' }
  return { kind: 'definite', reason: 'rejected' }
}

/** What the save should do, given the outcome of the flush that preceded it. */
export type SavePlan =
  | { proceed: true; token: RecoveryToken | null }
  | { proceed: false; reason: 'conflict' }

/**
 * Decide how to save after a pre-save flush (design §5, corrected 2026-08-07).
 *
 * ⚑ **A transport failure must NOT block the save.** The version save is the operation that matters;
 * the capture is insurance. Blocking a real save because its insurance failed inverts the priority
 * exactly — so `definite` and `indeterminate` both proceed.
 *
 * ⚑ **A 409 must block it.** A conflict means another tab holds newer work, so this is precisely the
 * case where saving on would retire it.
 *
 * ⚑ **An indeterminate flush saves with NO token.** This is the subtle one. The capture may have
 * committed with the response lost, leaving the held token stale; sending it would produce a 409 from
 * a save the user was told would proceed. Saving tokenless takes the no-token path the server already
 * supports (that is what the optional token is FOR) and leaves the active capture for expiry. The
 * alternative — a reconciling GET — costs an extra round trip on an already-degraded network to buy
 * the retirement of one row that will expire anyway.
 */
export const planSave = (outcome: CaptureOutcome, heldToken: RecoveryToken | null): SavePlan => {
  switch (outcome.kind) {
    case 'ok':
      return { proceed: true, token: outcome.token }
    case 'conflict':
      return { proceed: false, reason: 'conflict' }
    case 'definite':
      // The server declined before acting, so what the client holds is still current.
      return { proceed: true, token: heldToken }
    case 'indeterminate':
      return { proceed: true, token: null }
  }
}

/**
 * A cheap content fingerprint (FNV-1a, 32-bit).
 *
 * Used only to answer "is this the same oversized payload the server just refused?", so that a 413 is
 * not retried against byte-identical content every debounce tick for the rest of the session. It is
 * not security-relevant and a collision costs one wasted request.
 */
export const fingerprint = (s: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

/** What the indicator shows. The timestamp IS the contract (SPEC §5), so silence is not an option. */
export type RecoveryStatus =
  | { kind: 'off' }
  | { kind: 'starting' }
  | { kind: 'unavailable'; reason: 'atCapacity' | 'failed' }
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'backedUp'; at: number }
  | {
      kind: 'notBackedUp'
      reason: 'tooLarge' | 'rateLimited' | 'transport'
      retryAfterSec?: number
    }
  | { kind: 'conflict' }

/** Map a failed outcome onto what the user is told. */
export const statusForFailure = (outcome: CaptureOutcome): RecoveryStatus => {
  switch (outcome.kind) {
    case 'conflict':
      return { kind: 'conflict' }
    case 'definite':
      return outcome.reason === 'tooLarge'
        ? { kind: 'notBackedUp', reason: 'tooLarge' }
        : outcome.reason === 'rateLimited'
          ? { kind: 'notBackedUp', reason: 'rateLimited', retryAfterSec: outcome.retryAfterSec }
          : { kind: 'notBackedUp', reason: 'transport' }
    case 'indeterminate':
      return { kind: 'notBackedUp', reason: 'transport' }
    case 'ok':
      return { kind: 'backedUp', at: Date.now() }
  }
}
