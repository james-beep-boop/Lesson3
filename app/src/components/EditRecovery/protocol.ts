/**
 * Edit-recovery client protocol — the DECISIONS, as pure functions.
 *
 * Separated from `useEditRecovery` so the branching can be unit tested without React, a DOM or a
 * server. The hook owns timers, refs and fetch; this file owns "given what came back, what does that
 * mean" — which is where the protocol is actually easy to get wrong.
 */

/**
 * What every advancing write returns and the client must adopt (design §4's token rule).
 *
 * ⚑ **Imported from the server's kernel, not redeclared.** This is one wire contract, and two
 * structurally identical declarations type-check while agreeing — which is exactly why they must not
 * both exist. A server-side rename or added field would produce no compile error here; the client
 * would go on echoing a token the server no longer recognises, surfacing as a 409 on a save the user
 * was told would proceed. `EditorsWidget` records the same lesson from the same mistake.
 *
 * ⚑ The `type` keyword is load-bearing and must stay. `isolatedModules` is on, so a type-only import
 * is erased entirely and the bundler never sees an edge to `kernel.ts` — but a VALUE import from that
 * module would drag drizzle and the payload barrel into the client bundle. `tests/http` already
 * imports this same type from the same place.
 */
export type { RecoveryToken } from '../../lib/editRecovery/kernel'
import type { RecoveryToken } from '../../lib/editRecovery/kernel'

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
 * A cheap fingerprint of THE REQUEST AS SENT (FNV-1a, 32-bit).
 *
 * Used only to answer "is this the byte-identical request the server just refused with a 413?", so
 * that an oversized capture is not retried unchanged every debounce tick for the rest of the session.
 *
 * ⚑ It covers the whole body, including `generation` and `expectedRevision` — not just the document.
 * That is equivalent to hashing the content only because a 413 advances neither counter, which is a
 * property of the SERVER's capture statement and not of this file. Stated rather than assumed.
 *
 * Not security-relevant; a collision costs one wasted request. ⚑ Computed LAZILY by the caller —
 * only once a 413 has happened — because a full pass over a ~550 KB body costs about as much as
 * serialising it, and in the common case the result is never consulted.
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

/**
 * Map ANY outcome onto what the user is told.
 *
 * ⚑ Named for the outcome, not for failure: it handles all four kinds, and the `ok` branch is
 * reached by every caller. An earlier name (`statusForFailure`) invited one call site to re-implement
 * the success case inline, which is two places that must agree on what a successful capture displays.
 */
export const statusForOutcome = (outcome: CaptureOutcome): RecoveryStatus => {
  switch (outcome.kind) {
    case 'ok':
      return { kind: 'backedUp', at: Date.now() }
    case 'conflict':
      return { kind: 'conflict' }
    case 'indeterminate':
      return { kind: 'notBackedUp', reason: 'transport' }
    case 'definite':
      // Only `rejected` is renamed on the way out; the other two keep their own name, so the
      // special case is the one that is actually special.
      return outcome.reason === 'rejected'
        ? { kind: 'notBackedUp', reason: 'transport' }
        : { kind: 'notBackedUp', reason: outcome.reason, retryAfterSec: outcome.retryAfterSec }
  }
}
