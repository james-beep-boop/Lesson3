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

/**
 * The `req.context` key marking a forgot-password operation as the ADMIN reset-link path, which has
 * already paid its own `adminResetLink` toll and must not also consume the public budgets.
 *
 * Exported so the one endpoint allowed to set it and the hook that honours it share a spelling —
 * a literal repeated in two files is a silent carve-out failure waiting to happen (it would fail
 * OPEN, throttling the admin path, which is the safer direction but still wrong).
 */
export const ADMIN_RESET_LINK_CONTEXT = 'adminResetLink' as const

/**
 * Run `work` with the admin reset-link allowance in effect, and take it away again afterwards.
 *
 * ⚑ THE ALLOWANCE IS SCOPED, not set-and-forget. The first version assigned
 * `req.context[ADMIN_RESET_LINK_CONTEXT] = true` in the endpoint and never cleared it, so the
 * exemption covered the remainder of the request. Only one operation follows today, which makes that
 * a maintenance hazard rather than a defect — but it is one maintained by a comment, and the next
 * write added to that handler would silently inherit an unlimited public forgot-password budget with
 * nothing failing.
 *
 * Restoring the previous value in a `finally` makes the narrow scope structural, and puts the
 * mechanism in the module that OWNS the limiter rather than in the endpoint that benefits from it.
 */
export async function withAdminResetLinkAllowance<T>(
  req: { context?: Record<string, unknown> },
  work: () => Promise<T>,
): Promise<T> {
  const had = Object.prototype.hasOwnProperty.call(req.context ?? {}, ADMIN_RESET_LINK_CONTEXT)
  const previous = req.context?.[ADMIN_RESET_LINK_CONTEXT]
  req.context = { ...(req.context ?? {}), [ADMIN_RESET_LINK_CONTEXT]: true }
  try {
    return await work()
  } finally {
    if (had) req.context[ADMIN_RESET_LINK_CONTEXT] = previous
    else delete req.context[ADMIN_RESET_LINK_CONTEXT]
  }
}

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

  /**
   * ⚑ THE ADMIN RESET-LINK CARVE-OUT (D5a-i). A Site Administrator minting a hand-delivered reset
   * link runs `forgotPasswordOperation`, which fires this hook — so without this it would consume the
   * PUBLIC per-address and site-global daily budgets, and exhausting those would disable the only
   * account-recovery path a no-email deployment has.
   *
   * ⚑ THIS IS A CARVE-OUT, NOT A BYPASS, and the difference is the whole design. The cheap
   * implementations are wrong in the same way: testing `req.user` here would exempt EVERY
   * authenticated caller, so any signed-in Teacher could drive unlimited forgot-password operations.
   * Instead the flag is set by ONE endpoint, only after BOTH (a) the caller was authorized as a Site
   * Admin and (b) that endpoint's own `adminResetLink` cap was consumed. It is therefore not "an
   * authenticated request" that is exempt, it is "a request that already paid an admin-scoped toll".
   *
   * ⚑ `req.context` IS THE SAFE CARRIER precisely because it is server-side only — Payload builds it
   * per request and no request body, header or query parameter can populate it. A client cannot
   * forge this. That property is what makes the carve-out sound; do not move it to a header.
   *
   * Two tests, not one: the admin path is not throttled by the public budget, AND the ordinary public
   * `POST /forgot-password` still is. The second is what catches this quietly becoming a bypass.
   */
  if (kind === 'forgotPassword' && req.context?.[ADMIN_RESET_LINK_CONTEXT] === true) return args

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
