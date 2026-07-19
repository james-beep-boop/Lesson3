/**
 * Per-user rate limiting for the expensive generation endpoints (SPEC §11; readiness #1/#9).
 *
 * WHY here and not in Payload: Payload 3 dropped the built-in `rateLimit` config that v2's
 * Express server had (verified absent in installed `payload/dist/config/types.d.ts`, 3.85.1).
 * So throttling expensive endpoints is necessarily a small custom limiter.
 *
 * STORE: a SHARED Postgres-backed fixed-window counter — `rate_limit_counters`, one row per
 * `(bucket, user)` key, reused each request via an atomic UPSERT (migration
 * `20260629_213000_add_rate_limit_counters`). This supersedes the original in-memory per-process
 * window, which was correct only for the single-box Rock; the count now holds across replicas and
 * survives restarts, so the limiter is correct under horizontal scaling. Postgres (not Redis) keeps
 * the system single-runtime and adds no new infra.
 *
 * FIXED vs SLIDING (deliberate, documented): the prior window was a true sliding log; this is a fixed
 * window (`window_start = floor(now / windowMs) * windowMs`). A fixed window can admit up to ~2× the
 * budget across a single boundary, which is immaterial for an abuse guard with generous per-user
 * budgets — and it makes the shared-store path a single atomic statement instead of array pruning.
 *
 * The queue's `autoRun` `limit` is the *concurrency* bound on heavy work; this is the *request-rate*
 * bound on triggering it. Together they cover readiness #1.
 */
import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import type { User } from '../payload-types'
import { positiveIntEnv } from './env'

interface Limit {
  /** Max requests allowed within the window. */
  max: number
  /** Fixed window length in milliseconds. */
  windowMs: number
}

/**
 * Per-bucket limits, env-overridable, and the single source of the `Bucket` type — add a bucket
 * here and `enforceUserRateLimit` accepts it. Defaults are generous for real use, tight on abuse.
 */
const LIMITS = {
  export: {
    max: positiveIntEnv('RATE_LIMIT_EXPORT_MAX', 20),
    windowMs: positiveIntEnv('RATE_LIMIT_EXPORT_WINDOW_MS', 60_000),
  },
  preview: {
    max: positiveIntEnv('RATE_LIMIT_PREVIEW_MAX', 40),
    windowMs: positiveIntEnv('RATE_LIMIT_PREVIEW_WINDOW_MS', 60_000),
  },
  // Synchronous unsaved "View as PDF" (editor): each call runs Gotenberg IN the request, so it is
  // tighter than both `preview` (mammoth, cheap) and `export` (async via the jobs queue). Rate here,
  // concurrency in `lib/conversionLimit.ts` — the two together bound the heavy synchronous path.
  previewPdf: {
    max: positiveIntEnv('RATE_LIMIT_PREVIEW_PDF_MAX', 10),
    windowMs: positiveIntEnv('RATE_LIMIT_PREVIEW_PDF_WINDOW_MS', 60_000),
  },
  // Email-a-doc (SPEC §10) sends OUTBOUND mail to arbitrary addresses on the user's behalf, so its
  // budget is a DAILY CAP, not a burst window: 10 sends per user per 24h fixed window by default.
  // Deliberately much tighter than export/preview — the cost being bounded is other people's
  // inboxes (and our SMTP reputation), not our CPU.
  email: {
    max: positiveIntEnv('RATE_LIMIT_EMAIL_MAX', 10),
    windowMs: positiveIntEnv('RATE_LIMIT_EMAIL_WINDOW_MS', 86_400_000),
  },
  // Abuse controls ABOVE the per-user email cap (Codex audit 2026-07-02): the per-user cap alone
  // still lets many accounts (or one compromised account farm) generate real outbound volume.
  // `emailRecipient` bounds how much mail ONE address can receive from us per day (keyed by the
  // lowercased recipient via enforceSharedRateLimit — shared across senders); `emailGlobal` is the
  // site-wide daily ceiling on outbound sends (single shared key).
  emailRecipient: {
    max: positiveIntEnv('RATE_LIMIT_EMAIL_RECIPIENT_MAX', 20),
    windowMs: positiveIntEnv('RATE_LIMIT_EMAIL_RECIPIENT_WINDOW_MS', 86_400_000),
  },
  emailGlobal: {
    max: positiveIntEnv('RATE_LIMIT_EMAIL_GLOBAL_MAX', 1000),
    windowMs: positiveIntEnv('RATE_LIMIT_EMAIL_GLOBAL_WINDOW_MS', 86_400_000),
  },
  // Internal messaging (SPEC §10). A DAILY per-user cap like email — the bounded cost is other
  // users' inboxes, not CPU — but more generous: recipients are registered users, not arbitrary
  // addresses, and the notification email is content-free (see messagePingRecipient).
  message: {
    max: positiveIntEnv('RATE_LIMIT_MESSAGE_MAX', 50),
    windowMs: positiveIntEnv('RATE_LIMIT_MESSAGE_WINDOW_MS', 86_400_000),
  },
  // Open self-registration (2026-07-09): same two-tier shape as forgot-password — per requested
  // email (case games don't mint budgets) + a site-global daily ceiling on new accounts. There is
  // no email verification yet (a schema change — deferred), so these caps are the abuse bound.
  signup: {
    max: positiveIntEnv('RATE_LIMIT_SIGNUP_MAX', 3),
    windowMs: positiveIntEnv('RATE_LIMIT_SIGNUP_WINDOW_MS', 86_400_000),
  },
  signupGlobal: {
    max: positiveIntEnv('RATE_LIMIT_SIGNUP_GLOBAL_MAX', 100),
    windowMs: positiveIntEnv('RATE_LIMIT_SIGNUP_GLOBAL_WINDOW_MS', 86_400_000),
  },
  // "Request editing access" (teacher-first T3): ONE request per user per subject-grade per day —
  // the key is `${userId}:${subjectGradeId}` via enforceSharedRateLimit, so asking about Biology
  // G10 doesn't block asking about Chemistry G11. Bounds admin-inbox noise, not CPU.
  editRequest: {
    max: positiveIntEnv('RATE_LIMIT_EDIT_REQUEST_MAX', 1),
    windowMs: positiveIntEnv('RATE_LIMIT_EDIT_REQUEST_WINDOW_MS', 86_400_000),
  },
  // Cap on notification-ping EMAILS one recipient's real inbox can receive per day (keyed by the
  // recipient user id). The zero-unread gate already bounds pings to the recipient's own read
  // rate; this is the belt over that suspender. Exhaustion skips the ping, never the message.
  messagePingRecipient: {
    max: positiveIntEnv('RATE_LIMIT_MESSAGE_PING_RECIPIENT_MAX', 20),
    windowMs: positiveIntEnv('RATE_LIMIT_MESSAGE_PING_RECIPIENT_WINDOW_MS', 86_400_000),
  },
  // AUTH operations (SPEC §11 "generation, auth"; audit 2026-07-04) — enforced by the Users
  // beforeOperation hook (hooks/authRateLimit.ts). Login is keyed by the TARGET identifier
  // (lowercased email), bounding both distributed guessing and the lockout-DoS blast radius
  // (Payload's maxLoginAttempts:5 lockout guards single-account brute force; this throttles the
  // hammering itself). Budgets sit far above legitimate use: a real user logs in a handful of
  // times per hour, and 5 reset mails per address per day is generous.
  login: {
    max: positiveIntEnv('RATE_LIMIT_LOGIN_MAX', 20),
    windowMs: positiveIntEnv('RATE_LIMIT_LOGIN_WINDOW_MS', 3_600_000),
  },
  loginGlobal: {
    max: positiveIntEnv('RATE_LIMIT_LOGIN_GLOBAL_MAX', 1000),
    windowMs: positiveIntEnv('RATE_LIMIT_LOGIN_GLOBAL_WINDOW_MS', 3_600_000),
  },
  // forgot-password sends REAL outbound mail per request (unauthenticated-triggered) — the same
  // egress class as email-a-doc, so it gets the same two-tier cap shape: per-target-address and
  // site-global daily ceilings. Keyed by the REQUESTED address whether or not an account exists,
  // so the limiter itself can't be used as an account-existence oracle.
  forgotPassword: {
    max: positiveIntEnv('RATE_LIMIT_FORGOT_PASSWORD_MAX', 5),
    windowMs: positiveIntEnv('RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS', 86_400_000),
  },
  forgotPasswordGlobal: {
    max: positiveIntEnv('RATE_LIMIT_FORGOT_PASSWORD_GLOBAL_MAX', 100),
    windowMs: positiveIntEnv('RATE_LIMIT_FORGOT_PASSWORD_GLOBAL_WINDOW_MS', 86_400_000),
  },
  // Email-verification attempts (Codex 2026-07-10): the verify endpoint is public and token-only,
  // so there is no per-target identifier to key on (an attacker varies the token) and no reliable
  // IP without the Phase-5 edge proxy — a site-global daily ceiling is the honest app-level bound.
  // Sized ~3× signupGlobal: every legitimate verify follows a signup, plus retries. Per-IP
  // throttling lands with Phase 5 Track B edge rate limiting.
  verifyEmailGlobal: {
    max: positiveIntEnv('RATE_LIMIT_VERIFY_EMAIL_GLOBAL_MAX', 300),
    windowMs: positiveIntEnv('RATE_LIMIT_VERIFY_EMAIL_GLOBAL_WINDOW_MS', 86_400_000),
  },
} satisfies Record<string, Limit>

export type Bucket = keyof typeof LIMITS

/** Minimal view of the postgres adapter's drizzle handle — enough to run a parameterised statement. */
type DrizzleExec = { execute: (q: unknown) => Promise<{ rows: Array<{ count: number | string }> }> }

/**
 * Record a hit for `key` in the current fixed window and decide whether it is allowed, atomically.
 * One UPSERT: insert the row at count 1, or — on conflict — bump the count when the stored window is
 * the current one, else reset to 1 (a new window). The count is incremented even when over budget
 * (harmless: it is bounded by request volume within the window and resets next window), so the wait
 * is derived from the window boundary, not the count. Returns the wait in seconds when blocked.
 */
async function take(
  db: DrizzleExec,
  key: string,
  limit: Limit,
  now: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const windowStart = Math.floor(now / limit.windowMs) * limit.windowMs
  const result = await db.execute(sql`
    INSERT INTO "rate_limit_counters" AS r ("bucket_key", "window_start", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("bucket_key") DO UPDATE
    SET "window_start" = ${windowStart},
        "count" = CASE WHEN r."window_start" = ${windowStart} THEN r."count" + 1 ELSE 1 END
    RETURNING "count" AS count;`)
  const count = Number(result.rows[0]?.count ?? 0)
  if (count <= limit.max) return { ok: true, retryAfterSec: 0 }
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + limit.windowMs - now) / 1000))
  return { ok: false, retryAfterSec }
}

/**
 * Record a hit for `key` under `bucket` and return the raw allow/deny decision — the primitive the
 * `enforce*` Response wrappers build on. Exported for callers that need the decision WITHOUT an
 * HTTP Response: collection hooks (which signal errors by throwing, e.g. the messages create cap)
 * and best-effort consumers that skip work instead of failing (the message-ping recipient cap).
 */
export async function consumeRateLimit(
  req: PayloadRequest,
  bucket: Bucket,
  key: string,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const db = (req.payload.db as unknown as { drizzle: DrizzleExec }).drizzle
  return take(db, `${bucket}:${key}`, LIMITS[bucket], Date.now())
}

/**
 * Enforce the per-user rate limit for an endpoint. Returns a ready-to-return `429` Response
 * (with `Retry-After`) when the caller is over budget, or `null` when the request may proceed.
 * Keyed by user id so one user can't exhaust another's budget; unauthenticated callers are
 * rejected upstream (the handlers check `req.user`), so a missing user is treated as blocked.
 */
export async function enforceUserRateLimit(
  req: PayloadRequest,
  bucket: Bucket,
): Promise<Response | null> {
  const userId = (req.user as User | undefined)?.id
  if (userId === undefined || userId === null) {
    return jsonError('Unauthorized', 401)
  }
  const { ok, retryAfterSec } = await consumeRateLimit(req, bucket, String(userId))
  if (ok) return null
  return jsonError(
    `Too many ${bucket} requests — please wait ${retryAfterSec}s and try again.`,
    429,
    { 'Retry-After': String(retryAfterSec) },
  )
}

/**
 * Enforce a rate limit on a SHARED (non-user) key — e.g. per-recipient or site-global email caps —
 * against the same Postgres counter table. `key` is namespaced under the bucket exactly like the
 * user id is in {@link enforceUserRateLimit} (one key shape, one table). The caller supplies the
 * 429 `message` because a shared bucket's name ("emailGlobal") is not user-facing language.
 */
export async function enforceSharedRateLimit(
  req: PayloadRequest,
  bucket: Bucket,
  key: string,
  message: string,
): Promise<Response | null> {
  const { ok, retryAfterSec } = await consumeRateLimit(req, bucket, key)
  if (ok) return null
  return jsonError(message, 429, { 'Retry-After': String(retryAfterSec) })
}

/** A small JSON error Response matching Payload's `{ errors: [{ message }] }` shape. */
function jsonError(message: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ errors: [{ message }] }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}
