import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Public publication for lesson plans (SPEC §2; `docs/DESIGN-public-library.md`).
 *
 * `visibility` lands with `DEFAULT 'private'`, so every existing plan is backfilled to private by
 * the ADD COLUMN itself — publication is opt-in, and no plan becomes public by being migrated.
 *
 * The unique index on `public_slug` is the AUTHORITY on slug uniqueness; the friendly probe in
 * `hooks/lessonPlan.ts` is only a nicer error. Postgres treats NULLs as distinct by default, so the
 * many plans with no slug do not collide — a partial `WHERE public_slug IS NOT NULL` index would be
 * marginally smaller but is not needed for correctness, and would diverge from generator output.
 *
 * ⚑ The `down` drops the COLUMN before the TYPE it depends on, which is the ordering that matters
 * here — and it was proven by RUNNING the rollback (up → down → up, all clean), not by reading it.
 * This migration CREATES its enum rather than shrinking an existing one, so the `payload_jobs`
 * enum-shrink hazard that bit `20260625_125532_drop_lesson_bundles` does not apply.
 *
 * Args trimmed to `{ db }`, matching every other migration in this tree — the generator emits
 * `{ db, payload, req }` and ESLint runs at `--max-warnings=0`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lesson_plans_visibility" AS ENUM('private', 'unlisted', 'listed');
  ALTER TABLE "lesson_plans" ADD COLUMN "visibility" "enum_lesson_plans_visibility" DEFAULT 'private';
  ALTER TABLE "lesson_plans" ADD COLUMN "public_slug" varchar;
  CREATE UNIQUE INDEX "lesson_plans_public_slug_idx" ON "lesson_plans" USING btree ("public_slug");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "lesson_plans_public_slug_idx";
  ALTER TABLE "lesson_plans" DROP COLUMN "visibility";
  ALTER TABLE "lesson_plans" DROP COLUMN "public_slug";
  DROP TYPE "public"."enum_lesson_plans_visibility";`)
}
