import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds `lesson_bundle_versions.author_id` (authorship stamp for the Editor delete scope — IA
 * redesign PR ①, DECISIONS 2026-07-01 late). Existing rows stay NULL (= pre-authorship,
 * admin-only-deletable by decision; no backfill is possible or wanted).
 *
 * Hand-adjusted from the generated diff, which also carried two chain artifacts:
 *  - `CREATE TABLE rate_limit_counters`: the 20260629 migration that created it was hand-written
 *    WITHOUT a snapshot .json, so the diff baseline lacked the table. Guarded with IF NOT EXISTS —
 *    a no-op on live (table exists) and on a fresh chain (20260629 creates it first). This
 *    migration's snapshot .json includes the table, so the chain self-heals from here on.
 *  - `phase DROP NOT NULL`: a real, previously-unmaterialized consequence of hiding the admin-only
 *    fields behind `admin.condition` (PR #10) — Payload models condition-gated fields as nullable.
 *    Kept (loosening, data-safe; matches what push-mode CI DBs already have). Validation
 *    (`required`) and the `validateGeneratable` hard gate are unaffected.
 *
 * Everything is guarded so up/down are idempotent (project rule).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
  	"bucket_key" text PRIMARY KEY NOT NULL,
  	"window_start" bigint NOT NULL,
  	"count" integer NOT NULL
  );

  ALTER TABLE "lesson_bundle_versions_lessons_framework" ALTER COLUMN "phase" DROP NOT NULL;
  ALTER TABLE "lesson_bundle_versions" ADD COLUMN IF NOT EXISTS "author_id" integer;
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'lesson_bundle_versions_author_id_users_id_fk'
    ) THEN
      ALTER TABLE "lesson_bundle_versions" ADD CONSTRAINT "lesson_bundle_versions_author_id_users_id_fk"
        FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS "lesson_bundle_versions_author_idx" ON "lesson_bundle_versions" USING btree ("author_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "rate_limit_counters" CASCADE;
  ALTER TABLE "lesson_bundle_versions" DROP CONSTRAINT IF EXISTS "lesson_bundle_versions_author_id_users_id_fk";

  DROP INDEX IF EXISTS "lesson_bundle_versions_author_idx";
  ALTER TABLE "lesson_bundle_versions_lessons_framework" ALTER COLUMN "phase" SET NOT NULL;
  ALTER TABLE "lesson_bundle_versions" DROP COLUMN IF EXISTS "author_id";`)
}
