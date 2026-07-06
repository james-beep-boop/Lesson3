import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Favorites become per-VERSION (§10, version-browser redesign PR ① — DECISIONS 2026-07-06):
 * `favorites.lesson_plan_id` → `favorites.version_id`, unique `(user, version)`. Generated from the
 * schema diff, then hand-edited (project rule: guarded idempotent up/down) to:
 *
 *   - add `version_id` NULLABLE first, MAP each existing favorite to its plan's current Official
 *     version (the natural per-version reading of "I favorited this lesson"), and only then set
 *     NOT NULL — the generated `ADD COLUMN … NOT NULL` would fail on any non-empty table and lose
 *     every existing favorite. No dedupe needed upward: old rows are unique per (user, plan) and
 *     each plan has at most one Official version, so (user, version) cannot collide.
 *   - ABORT (fails safe, Codex 2026-07-06 #1) if any favorite's plan has NO Official version to map
 *     to — shouldn't exist live (the invariant hooks enforce exactly-one-Official), but a silent
 *     DELETE would destroy user data on exactly the anomaly it didn't anticipate. The migration
 *     transaction rolls back; the raised message carries the row count. Repair the plans' pointers
 *     (or knowingly delete the rows) and re-run; deploy.sh has its pre-migration snapshot either way.
 *
 * `down` maps version → its plan and DEDUPES (several per-version favorites of one plan collapse
 * to one per-plan row, keeping the newest — the old unique (user, plan) index leaves no lossless
 * option) before restoring that index.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "favorites" DROP CONSTRAINT IF EXISTS "favorites_lesson_plan_id_lesson_plans_id_fk";

  DROP INDEX IF EXISTS "favorites_lesson_plan_idx";
  DROP INDEX IF EXISTS "user_lessonPlan_idx";
  ALTER TABLE "favorites" ADD COLUMN IF NOT EXISTS "version_id" integer;
  DO $$ DECLARE unmapped integer; BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'favorites' AND column_name = 'lesson_plan_id') THEN
      UPDATE "favorites" f
        SET "version_id" = lp."official_version_id"
        FROM "lesson_plans" lp
        WHERE lp."id" = f."lesson_plan_id" AND f."version_id" IS NULL;
    END IF;
    SELECT count(*) INTO unmapped FROM "favorites" WHERE "version_id" IS NULL;
    IF unmapped > 0 THEN
      RAISE EXCEPTION 'favorites_per_version: % favorites row(s) cannot map to an Official version (their lesson plan has no official_version_id). Repair the pointers or knowingly delete the rows, then re-run.', unmapped;
    END IF;
  END $$;
  ALTER TABLE "favorites" ALTER COLUMN "version_id" SET NOT NULL;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorites_version_id_lesson_bundle_versions_id_fk') THEN
      ALTER TABLE "favorites" ADD CONSTRAINT "favorites_version_id_lesson_bundle_versions_id_fk"
        FOREIGN KEY ("version_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null ON UPDATE no action;
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS "favorites_version_idx" ON "favorites" USING btree ("version_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "user_version_idx" ON "favorites" USING btree ("user_id","version_id");
  ALTER TABLE "favorites" DROP COLUMN IF EXISTS "lesson_plan_id";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "favorites" DROP CONSTRAINT IF EXISTS "favorites_version_id_lesson_bundle_versions_id_fk";

  DROP INDEX IF EXISTS "favorites_version_idx";
  DROP INDEX IF EXISTS "user_version_idx";
  ALTER TABLE "favorites" ADD COLUMN IF NOT EXISTS "lesson_plan_id" integer;
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'favorites' AND column_name = 'version_id') THEN
      UPDATE "favorites" f
        SET "lesson_plan_id" = v."lesson_plan_id"
        FROM "lesson_bundle_versions" v
        WHERE v."id" = f."version_id" AND f."lesson_plan_id" IS NULL;
      -- Dedupe (user, plan): per-version favorites of one plan collapse to one row (keep newest).
      DELETE FROM "favorites" a
        USING "favorites" b
        WHERE a."user_id" = b."user_id" AND a."lesson_plan_id" = b."lesson_plan_id"
          AND (a."created_at" < b."created_at" OR (a."created_at" = b."created_at" AND a."id" < b."id"));
    END IF;
  END $$;
  DELETE FROM "favorites" WHERE "lesson_plan_id" IS NULL;
  ALTER TABLE "favorites" ALTER COLUMN "lesson_plan_id" SET NOT NULL;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorites_lesson_plan_id_lesson_plans_id_fk') THEN
      ALTER TABLE "favorites" ADD CONSTRAINT "favorites_lesson_plan_id_lesson_plans_id_fk"
        FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS "favorites_lesson_plan_idx" ON "favorites" USING btree ("lesson_plan_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "user_lessonPlan_idx" ON "favorites" USING btree ("user_id","lesson_plan_id");
  ALTER TABLE "favorites" DROP COLUMN IF EXISTS "version_id";`)
}
