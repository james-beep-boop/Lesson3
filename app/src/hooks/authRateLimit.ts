/**
 * Auth-operation rate limiting (SPEC §11 "rate limiting on expensive endpoints (generation,
 * auth)"; audit 2026-07-04). `login` and `forgot-password` are Payload-INTERNAL operations, not
 * custom endpoints, so the existing per-endpoint limiter calls can't cover them — but both
 * operations run the collection's `beforeOperation` hooks before doing any work (verified in
 * installed source: auth/operations/login.js + forgotPassword.js), so this hook is the seam.
 *
 * What it bounds, and why:
 *  - LOGIN, per target identifier + global. Payload's default account lockout
 *    (maxLoginAttempts: 5) already stops single-account brute force; this throttles the hammering
 *    itself — distributed guessing across accounts (global cap) and the lockout-DoS where an
 *    attacker re-locks a victim's account forever (per-target cap bounds the attempts/hour).
 *  - FORGOT-PASSWORD, per target address + global. Each request sends REAL outbound mail with no
 *    authentication required — the same egress class the email-a-doc caps guard — so it gets the
 *    same two-tier shape (per-recipient + site ceiling).
 *
 * Existence-oracle safety: budgets are keyed by the REQUESTED identifier whether or not an account
 * exists, and the 429 text names only the request rate — so neither the limit nor its message
 * reveals whether an address is registered.
 *
 * Local-API note: trusted system paths that call `payload.login()` (tests, seed scripts) spend
 * budget like anyone else — deliberate, since these operations have no user/overrideAccess axis
 * that distinguishes trust here. Budgets are far above legitimate use; int tests clean their keys.
 */
import type { CollectionBeforeOperationHook } from 'payload'
import { APIError } from 'payload'

import { consumeRateLimit } from '../lib/rateLimit'

/** The auth data shape both operations carry (email-only login — loginWithUsername is off). */
type AuthArgs = { data?: { email?: unknown } }

export const rateLimitAuthOperations: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  // Open self-registration (2026-07-09): an UNAUTHENTICATED create is a signup — same
  // unauthenticated-surface treatment as login/forgot-password (per-email + global caps).
  // Authenticated creates (Site Admin) and trusted Local-API paths with a user stay uncapped.
  if (operation === 'create' && !req.user) {
    const rawEmail = (args as AuthArgs).data?.email
    const key =
      typeof rawEmail === 'string' && rawEmail.trim() !== '' ? rawEmail.trim().toLowerCase() : 'invalid'
    const perTarget = await consumeRateLimit(req, 'signup', key)
    if (!perTarget.ok) {
      throw new APIError('Too many sign-up attempts for this address — please try again tomorrow.', 429)
    }
    const globalHit = await consumeRateLimit(req, 'signupGlobal', 'all')
    if (!globalHit.ok) {
      throw new APIError('Sign-ups are temporarily paused — please try again tomorrow.', 429)
    }
    return args
  }

  if (operation !== 'login' && operation !== 'forgotPassword') return args

  // Key by the lowercased target so case games don't mint fresh budgets (same rule as the email
  // recipient cap). A missing/garbage email still consumes a bucket ('invalid') — probing with
  // malformed bodies is not free — and the operation itself then rejects it.
  const raw = (args as AuthArgs).data?.email
  const target = typeof raw === 'string' && raw.trim() !== '' ? raw.trim().toLowerCase() : 'invalid'

  const [perTarget, global] =
    operation === 'login'
      ? ([`login`, `loginGlobal`] as const)
      : ([`forgotPassword`, `forgotPasswordGlobal`] as const)

  const targetHit = await consumeRateLimit(req, perTarget, target)
  if (!targetHit.ok) {
    throw new APIError(
      operation === 'login'
        ? `Too many sign-in attempts — please wait ${targetHit.retryAfterSec}s and try again.`
        : 'Too many password-reset requests for this address — please try again tomorrow.',
      429,
    )
  }
  const globalHit = await consumeRateLimit(req, global, 'all')
  if (!globalHit.ok) {
    throw new APIError(
      operation === 'login'
        ? `Too many sign-in attempts — please wait ${globalHit.retryAfterSec}s and try again.`
        : 'Too many password-reset requests — please try again tomorrow.',
      429,
    )
  }

  return args
}
