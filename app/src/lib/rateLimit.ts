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
    max: Number(process.env.RATE_LIMIT_EXPORT_MAX) || 20,
    windowMs: Number(process.env.RATE_LIMIT_EXPORT_WINDOW_MS) || 60_000,
  },
  preview: {
    max: Number(process.env.RATE_LIMIT_PREVIEW_MAX) || 40,
    windowMs: Number(process.env.RATE_LIMIT_PREVIEW_WINDOW_MS) || 60_000,
  },
} satisfies Record<string, Limit>

type Bucket = keyof typeof LIMITS

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
  const limit = LIMITS[bucket]
  const db = (req.payload.db as unknown as { drizzle: DrizzleExec }).drizzle
  const { ok, retryAfterSec } = await take(db, `${bucket}:${userId}`, limit, Date.now())
  if (ok) return null
  return jsonError(
    `Too many ${bucket} requests — please wait ${retryAfterSec}s and try again.`,
    429,
    { 'Retry-After': String(retryAfterSec) },
  )
}

/** A small JSON error Response matching Payload's `{ errors: [{ message }] }` shape. */
function jsonError(message: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ errors: [{ message }] }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}
