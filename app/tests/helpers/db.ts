/**
 * Raw-SQL escape hatches for tests.
 *
 * Six specs independently hand-roll `(payload.db as unknown as { drizzle: … }).drizzle` to reach the
 * adapter, and they had already drifted — most type `execute` as returning `Promise<unknown>`, the
 * http suite as `Promise<{ rows: unknown[] }>`. Because the cast launders through `unknown`, the
 * compiler cannot flag any of them when the adapter shape changes; they have to be found by grep.
 *
 * This is the one definition new code should use. The five pre-existing sites still have their own
 * copies — converting them is worthwhile but is churn beyond the change that created this file, so
 * they are left as a landing place rather than rewritten in passing.
 */
import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

type DrizzleHandle = { execute: (q: unknown) => Promise<unknown> }

/** The drizzle handle behind a Payload instance, for statements the Local API cannot express. */
export function drizzleOf(payload: Payload): DrizzleHandle {
  return (payload as unknown as { db: { drizzle: DrizzleHandle } }).db.drizzle
}

/**
 * Delete rate-limit counters whose bucket key matches a LIKE pattern.
 *
 * Worth centralising because the bucket-key format is owned by `src/lib/rateLimit.ts` but is encoded
 * as string literals across the suite. If that scheme changes, these cleanups do not fail loudly —
 * they silently match nothing, and the symptom is a LATER, unrelated spec dying because a shared
 * daily budget was never released. That exact failure (six suites down with "Sign-ups are temporarily
 * paused") is what prompted this helper.
 */
export async function clearRateLimitBuckets(payload: Payload, likePattern: string): Promise<void> {
  await drizzleOf(payload).execute(
    sql`DELETE FROM "rate_limit_counters" WHERE "bucket_key" LIKE ${likePattern};`,
  )
}
