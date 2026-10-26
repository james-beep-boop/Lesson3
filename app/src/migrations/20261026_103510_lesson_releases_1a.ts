import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lesson_plans" ADD COLUMN "official_changed_at" timestamp(3) with time zone;
  ALTER TABLE "lesson_plans" ADD COLUMN "official_changed_from_id" integer;
  ALTER TABLE "lesson_plans" ADD COLUMN "official_changed_by_id" integer;
  ALTER TABLE "lesson_bundle_versions" ADD COLUMN "ares_release_id" varchar;
  ALTER TABLE "lesson_bundle_versions" ADD COLUMN "ares_release_date" varchar;
  ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_official_changed_from_id_lesson_bundle_versions_id_fk" FOREIGN KEY ("official_changed_from_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_official_changed_by_id_users_id_fk" FOREIGN KEY ("official_changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lesson_plans_official_changed_from_idx" ON "lesson_plans" USING btree ("official_changed_from_id");
  CREATE INDEX "lesson_plans_official_changed_by_idx" ON "lesson_plans" USING btree ("official_changed_by_id");
  CREATE INDEX "lesson_bundle_versions_ares_release_id_idx" ON "lesson_bundle_versions" USING btree ("ares_release_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lesson_plans" DROP CONSTRAINT "lesson_plans_official_changed_from_id_lesson_bundle_versions_id_fk";

  ALTER TABLE "lesson_plans" DROP CONSTRAINT "lesson_plans_official_changed_by_id_users_id_fk";

  DROP INDEX "lesson_plans_official_changed_from_idx";
  DROP INDEX "lesson_plans_official_changed_by_idx";
  DROP INDEX "lesson_bundle_versions_ares_release_id_idx";
  ALTER TABLE "lesson_plans" DROP COLUMN "official_changed_at";
  ALTER TABLE "lesson_plans" DROP COLUMN "official_changed_from_id";
  ALTER TABLE "lesson_plans" DROP COLUMN "official_changed_by_id";
  ALTER TABLE "lesson_bundle_versions" DROP COLUMN "ares_release_id";
  ALTER TABLE "lesson_bundle_versions" DROP COLUMN "ares_release_date";`)
}
