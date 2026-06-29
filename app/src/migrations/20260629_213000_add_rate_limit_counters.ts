import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Shared-store backing for the per-user rate limiter (`lib/rateLimit.ts`, SPEC §11 / readiness #9).
 *
 * Replaces the previous in-memory per-process window so the limit holds across replicas (and survives
 * a restart). A fixed-window counter: one row per `(bucket, user)` key, reused each request via an
 * atomic UPSERT — bounded by distinct users, not by request volume. NOT a Payload collection (it is
 * limiter bookkeeping, not domain content, and must not appear in the admin UI), so it is created by
 * raw SQL here rather than a generated schema and there is no `payload-types` change.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
      "bucket_key" text PRIMARY KEY,
      "window_start" bigint NOT NULL,
      "count" integer NOT NULL
    );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "rate_limit_counters";`)
}
