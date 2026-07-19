import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- The preceding cutover's flattened schema could not successfully create/read a version, and
   -- the cutover was explicitly deployed over an empty corpus. Refuse to drop those columns if a
   -- row somehow exists rather than silently discarding resource data.
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM "lesson_plans" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions_lessons" LIMIT 1) THEN
       RAISE EXCEPTION 'resource_links_child_rows requires an empty lesson corpus. Export or remove retained lesson versions before applying; this corrective migration does not discard flattened resource links.';
     END IF;
   END $$;

  CREATE TYPE "public"."enum_lesson_bundle_versions_lessons_resource_links_phase" AS ENUM('predict', 'observe', 'explain', 'dqb', 'model');
  CREATE TABLE "lesson_bundle_versions_lessons_resource_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"phase" "enum_lesson_bundle_versions_lessons_resource_links_phase" NOT NULL,
  	"video_title" varchar,
  	"video_source" varchar,
  	"video_content_type" varchar,
  	"video_direct_url" varchar,
  	"video_search_url" varchar,
  	"video_search_terms" varchar,
  	"video_exact_search_url" varchar,
  	"video_has_transcript" boolean,
  	"video_tier" numeric,
  	"reading_title" varchar,
  	"reading_source" varchar,
  	"reading_content_type" varchar,
  	"reading_direct_url" varchar,
  	"reading_search_url" varchar,
  	"reading_search_terms" varchar,
  	"reading_exact_search_url" varchar,
  	"reading_has_transcript" boolean,
  	"reading_tier" numeric,
  	"fallback_search_url" varchar NOT NULL
  );
  
  ALTER TABLE "lesson_bundle_versions_lessons_resource_links" ADD CONSTRAINT "lesson_bundle_versions_lessons_resource_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundle_versions_lessons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lesson_bundle_versions_lessons_resource_links_order_idx" ON "lesson_bundle_versions_lessons_resource_links" USING btree ("_order");
  CREATE INDEX "lesson_bundle_versions_lessons_resource_links_parent_id_idx" ON "lesson_bundle_versions_lessons_resource_links" USING btree ("_parent_id");
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

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Rolling back drops the normalized resource rows. Keep the same empty-corpus safety boundary
   -- as up() so a rollback can never silently erase lesson resources.
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM "lesson_plans" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions_lessons" LIMIT 1)
        OR EXISTS (SELECT 1 FROM "lesson_bundle_versions_lessons_resource_links" LIMIT 1) THEN
       RAISE EXCEPTION 'resource_links_child_rows rollback requires an empty lesson corpus. Export or remove retained lesson versions before rolling back.';
     END IF;
   END $$;

  DROP TABLE "lesson_bundle_versions_lessons_resource_links" CASCADE;
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
  DROP TYPE "public"."enum_lesson_bundle_versions_lessons_resource_links_phase";`)
}
