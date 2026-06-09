import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Drop the unused `subjects.slug` column (+ its unique index). It was create-payload-app
// scaffold residue — referenced nowhere in logic (ingest matches Subject by `name`, RBAC by
// id; no routes use it). See docs/DECISIONS.md 2026-06-09. Hand-authored (no local DB to run
// migrate:create); `up` is idempotent (IF EXISTS) per the migration-gen lesson.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "subjects_slug_idx";
  ALTER TABLE "subjects" DROP COLUMN IF EXISTS "slug";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "subjects" ADD COLUMN "slug" varchar;
  CREATE UNIQUE INDEX "subjects_slug_idx" ON "subjects" USING btree ("slug");`)
}
