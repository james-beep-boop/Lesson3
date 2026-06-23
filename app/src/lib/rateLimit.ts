/**
 * Per-user rate limiting for the expensive generation endpoints (SPEC §11; readiness #1).
 *
 * WHY here and not in Payload: Payload 3 dropped the built-in `rateLimit` config that v2's
 * Express server had (verified absent in installed `payload/dist/config/types.d.ts`, 3.85.1).
 * So throttling expensive endpoints is necessarily a small custom limiter.
 *
 * SCOPE / CAVEAT: an in-memory sliding window, keyed per user + bucket. It is PER-PROCESS —
 * not shared across replicas and reset on restart. That is correct for the single-box Rock
 * (one app container); if the app is ever horizontally scaled this must move to a shared store
 * (Redis/Postgres). The queue's `autoRun` `limit` is the *concurrency* bound on heavy work;
 * this is the *request-rate* bound on triggering it. Together they cover readiness #1.
 */
import type { PayloadRequest } from 'payload'

import type { User } from '../payload-types'

type Bucket = 'export' | 'preview'

interface Limit {
  /** Max requests allowed within the window. */
  max: number
  /** Sliding window length in milliseconds. */
  windowMs: number
}

/** Per-bucket limits, env-overridable. Defaults are generous for real use, tight on abuse. */
const LIMITS: Record<Bucket, Limit> = {
  export: {
    max: Number(process.env.RATE_LIMIT_EXPORT_MAX) || 20,
    windowMs: Number(process.env.RATE_LIMIT_EXPORT_WINDOW_MS) || 60_000,
  },
  preview: {
    max: Number(process.env.RATE_LIMIT_PREVIEW_MAX) || 40,
    windowMs: Number(process.env.RATE_LIMIT_PREVIEW_WINDOW_MS) || 60_000,
  },
}

/** key → ascending list of request timestamps (ms) still inside the window. */
const hits = new Map<string, number[]>()

/**
 * Record a hit for (user, bucket) and decide whether it is allowed. Returns the wait time in
 * seconds when blocked (0 when allowed). Prunes expired timestamps as it goes, so the map does
 * not grow unbounded for active users; idle keys are dropped once their window empties.
 */
function take(key: string, limit: Limit, now: number): { ok: boolean; retryAfterSec: number } {
  const cutoff = now - limit.windowMs
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff)
  if (recent.length >= limit.max) {
    hits.set(key, recent)
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + limit.windowMs - now) / 1000))
    return { ok: false, retryAfterSec }
  }
  recent.push(now)
  hits.set(key, recent)
  return { ok: true, retryAfterSec: 0 }
}

/**
 * Enforce the per-user rate limit for an endpoint. Returns a ready-to-return `429` Response
 * (with `Retry-After`) when the caller is over budget, or `null` when the request may proceed.
 * Keyed by user id so one user can't exhaust another's budget; unauthenticated callers are
 * rejected upstream (the handlers check `req.user`), so a missing user is treated as blocked.
 */
export function enforceUserRateLimit(req: PayloadRequest, bucket: Bucket): Response | null {
  const userId = (req.user as User | undefined)?.id
  if (userId === undefined || userId === null) {
    return jsonError('Unauthorized', 401)
  }
  const limit = LIMITS[bucket]
  const { ok, retryAfterSec } = take(`${bucket}:${userId}`, limit, Date.now())
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
