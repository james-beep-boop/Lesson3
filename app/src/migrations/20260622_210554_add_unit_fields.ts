import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_grade_level" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_subject" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_strand" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_substrand" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_total_duration" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_content" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_learning_outcomes" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_core_competencies" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_values" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_sep" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_pcis" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_careers" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_focus" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_driving_question" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_phenomenon" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_supporting_phenomena" varchar;
  ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_storyline_thread" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_grade_level" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_subject" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_strand" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_substrand" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_total_duration" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_content" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_learning_outcomes" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_core_competencies" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_values" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_sep" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_pcis" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_careers" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_focus" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_driving_question" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_phenomenon" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_supporting_phenomena" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_storyline_thread" varchar;
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_overview";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_overview";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lesson_bundles" ADD COLUMN IF NOT EXISTS "unit_overview" varchar;
  ALTER TABLE "_lesson_bundles_v" ADD COLUMN IF NOT EXISTS "version_unit_overview" varchar;
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_grade_level";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_subject";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_strand";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_substrand";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_total_duration";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_content";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_learning_outcomes";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_core_competencies";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_values";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_sep";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_pcis";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_careers";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_focus";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_driving_question";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_phenomenon";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_supporting_phenomena";
  ALTER TABLE "lesson_bundles" DROP COLUMN IF EXISTS "unit_storyline_thread";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_grade_level";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_subject";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_strand";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_substrand";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_total_duration";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_content";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_learning_outcomes";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_core_competencies";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_values";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_sep";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_pcis";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_careers";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_focus";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_driving_question";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_phenomenon";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_supporting_phenomena";
  ALTER TABLE "_lesson_bundles_v" DROP COLUMN IF EXISTS "version_unit_storyline_thread";`)
}
