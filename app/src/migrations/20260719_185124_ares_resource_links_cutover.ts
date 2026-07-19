import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Clean contract cutover: required fallback URLs cannot be added safely over retained old
   -- lesson rows. The user permanently deleted the former corpus; fail actionably if any rows remain
   -- instead of manufacturing resource data or letting the first NOT NULL ALTER fail opaquely.
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM "lesson_plans" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions_lessons" LIMIT 1) THEN
       RAISE EXCEPTION 'ares_resource_links_cutover requires an empty Lesson3 corpus (lesson_plans, lesson_bundle_versions, and lessons). Remove or resolve retained plan/version rows before applying; no legacy backfill exists.';
     END IF;
   END $$;

  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_video_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_reading_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_predict_fallback_search_url" varchar NOT NULL;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_video_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_reading_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_observe_fallback_search_url" varchar NOT NULL;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_video_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_reading_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_explain_fallback_search_url" varchar NOT NULL;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_video_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_reading_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_dqb_fallback_search_url" varchar NOT NULL;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_video_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_source" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_content_type" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_search_terms" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_exact_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_has_transcript" boolean;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_reading_tier" numeric;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD COLUMN "resource_links_model_fallback_search_url" varchar NOT NULL;
  ALTER TABLE "lesson_bundle_versions_lessons_framework" DROP COLUMN "resources_video_title";
  ALTER TABLE "lesson_bundle_versions_lessons_framework" DROP COLUMN "resources_video_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons_framework" DROP COLUMN "resources_video_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons_framework" DROP COLUMN "resources_reading_title";
  ALTER TABLE "lesson_bundle_versions_lessons_framework" DROP COLUMN "resources_reading_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons_framework" DROP COLUMN "resources_reading_search_url";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Data-safety guard (mirrors up()): rolling back DROPs all 95 lesson-level resource_links_*
   -- columns and restores only the six sparse legacy framework resource columns, which CANNOT
   -- represent the complete new resource data. On a populated corpus this would SILENTLY destroy
   -- every lesson's resourceLinks, so refuse rollback unless the corpus is empty. Do not fabricate
   -- or partially map data into the legacy columns.
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM "lesson_plans" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions_lessons" LIMIT 1) THEN
       RAISE EXCEPTION 'ares_resource_links_cutover rollback requires an empty Lesson3 corpus (lesson_plans, lesson_bundle_versions, and lessons). The legacy schema cannot preserve lesson-level resourceLinks, so rolling back over retained rows would destroy resource data. Remove or export the corpus before rolling back.';
     END IF;
   END $$;

   ALTER TABLE "lesson_bundle_versions_lessons_framework" ADD COLUMN "resources_video_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons_framework" ADD COLUMN "resources_video_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons_framework" ADD COLUMN "resources_video_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons_framework" ADD COLUMN "resources_reading_title" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons_framework" ADD COLUMN "resources_reading_direct_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons_framework" ADD COLUMN "resources_reading_search_url" varchar;
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_video_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_reading_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_predict_fallback_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_video_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_reading_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_observe_fallback_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_video_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_reading_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_explain_fallback_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_video_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_reading_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_dqb_fallback_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_video_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_title";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_source";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_content_type";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_direct_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_search_terms";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_exact_search_url";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_has_transcript";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_reading_tier";
  ALTER TABLE "lesson_bundle_versions_lessons" DROP COLUMN "resource_links_model_fallback_search_url";`)
}
