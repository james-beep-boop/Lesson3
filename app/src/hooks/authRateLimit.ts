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
 *  - SIGNUP (open self-registration, 2026-07-09): an UNAUTHENTICATED users create. Per requested
 *    email + a site-global daily ceiling on new accounts. These caps also bound the verification
 *    emails signup sends (auth.verify, added later the same day): one per create, so the signup
 *    budget IS the verification-mail budget — no separate bucket needed.
 *
 * Existence-oracle safety: budgets are keyed by the REQUESTED identifier whether or not an account
 * exists, and the 429 text names only the request rate — so neither the limit nor its message
 * reveals whether an address is registered.
 *
 * Local-API note: trusted system paths that call `payload.login()` — or create users WITHOUT a
 * `req.user` (seed scripts) — spend budget like anyone else — deliberate, since these operations have no user/overrideAccess axis
 * that distinguishes trust here. Budgets are far above legitimate use; int tests clean their keys.
 */
import type { CollectionBeforeOperationHook } from 'payload'
import { APIError } from 'payload'

import { consumeRateLimit, type Bucket } from '../lib/rateLimit'

/** The auth data shape both operations carry (email-only login — loginWithUsername is off). */
type AuthArgs = { data?: { email?: unknown } }

/** One throttled surface per row: its two buckets and its user-facing 429 texts. `retryAfterSec`
 *  only surfaces for login (the short-window case where "wait Ns" is actionable). */
const THROTTLED = {
  login: {
    buckets: ['login', 'loginGlobal'],
    message: (retryAfterSec: number) =>
      `Too many sign-in attempts — please wait ${retryAfterSec}s and try again.`,
    globalMessage: (retryAfterSec: number) =>
      `Too many sign-in attempts — please wait ${retryAfterSec}s and try again.`,
  },
  forgotPassword: {
    buckets: ['forgotPassword', 'forgotPasswordGlobal'],
    message: () => 'Too many password-reset requests for this address — please try again tomorrow.',
    globalMessage: () => 'Too many password-reset requests — please try again tomorrow.',
  },
  signup: {
    buckets: ['signup', 'signupGlobal'],
    message: () => 'Too many sign-up attempts for this address — please try again tomorrow.',
    globalMessage: () => 'Sign-ups are temporarily paused — please try again tomorrow.',
  },
} as const satisfies Record<
  string,
  {
    buckets: readonly [Bucket, Bucket]
    message: (retryAfterSec: number) => string
    globalMessage: (retryAfterSec: number) => string
  }
>

export const rateLimitAuthOperations: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  // Which throttled unauthenticated surface is this? Open self-registration (2026-07-09) joins
  // login/forgot-password: an UNAUTHENTICATED create is a signup. Authenticated creates (Site
  // Admin) and trusted Local-API paths with a user stay uncapped.
  const kind =
    operation === 'login' || operation === 'forgotPassword'
      ? operation
      : operation === 'create' && !req.user
        ? ('signup' as const)
        : null
  if (!kind) return args

  // Key by the lowercased target so case games don't mint fresh budgets (same rule as the email
  // recipient cap). A missing/garbage email still consumes a bucket ('invalid') — probing with
  // malformed bodies is not free — and the operation itself then rejects it.
  const raw = (args as AuthArgs).data?.email
  const target = typeof raw === 'string' && raw.trim() !== '' ? raw.trim().toLowerCase() : 'invalid'

  const { buckets, message, globalMessage } = THROTTLED[kind]
  const targetHit = await consumeRateLimit(req, buckets[0], target)
  if (!targetHit.ok) {
    throw new APIError(message(targetHit.retryAfterSec), 429)
  }
  const globalHit = await consumeRateLimit(req, buckets[1], 'all')
  if (!globalHit.ok) {
    throw new APIError(globalMessage(globalHit.retryAfterSec), 429)
  }

  return args
}
