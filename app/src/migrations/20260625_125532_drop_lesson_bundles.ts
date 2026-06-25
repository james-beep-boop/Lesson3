import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Stage 3: drop stale completed jobs from the retired bundle-export task so the
   -- task_slug enum can be rebuilt without the now-removed 'generateArtifact' value.
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'generateArtifact';
   DELETE FROM "payload_jobs" WHERE "task_slug" = 'generateArtifact';
   ALTER TABLE "lesson_bundles_lessons_framework" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_final_explanation_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_final_explanation_rubric" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_summary_table_lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_lesson_bundles_v_version_lessons_framework" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_lesson_bundles_v_version_lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_lesson_bundles_v_version_final_explanation_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_lesson_bundles_v_version_final_explanation_rubric" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_lesson_bundles_v_version_summary_table_lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_lesson_bundles_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "lesson_bundles_lessons_framework" CASCADE;
  DROP TABLE IF EXISTS "lesson_bundles_lessons" CASCADE;
  DROP TABLE IF EXISTS "lesson_bundles_final_explanation_sections" CASCADE;
  DROP TABLE IF EXISTS "lesson_bundles_final_explanation_rubric" CASCADE;
  DROP TABLE IF EXISTS "lesson_bundles_summary_table_lessons" CASCADE;
  DROP TABLE IF EXISTS "lesson_bundles" CASCADE;
  DROP TABLE IF EXISTS "_lesson_bundles_v_version_lessons_framework" CASCADE;
  DROP TABLE IF EXISTS "_lesson_bundles_v_version_lessons" CASCADE;
  DROP TABLE IF EXISTS "_lesson_bundles_v_version_final_explanation_sections" CASCADE;
  DROP TABLE IF EXISTS "_lesson_bundles_v_version_final_explanation_rubric" CASCADE;
  DROP TABLE IF EXISTS "_lesson_bundles_v_version_summary_table_lessons" CASCADE;
  DROP TABLE IF EXISTS "_lesson_bundles_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_lesson_bundles_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE IF EXISTS "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'generateVersionArtifact');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE IF EXISTS "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'generateVersionArtifact');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_lesson_bundles_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "lesson_bundles_id";
  DROP TYPE IF EXISTS "public"."enum_lesson_bundles_lessons_framework_phase";
  DROP TYPE IF EXISTS "public"."enum_lesson_bundles_bump_type";
  DROP TYPE IF EXISTS "public"."enum_lesson_bundles_status";
  DROP TYPE IF EXISTS "public"."enum__lesson_bundles_v_version_lessons_framework_phase";
  DROP TYPE IF EXISTS "public"."enum__lesson_bundles_v_version_bump_type";
  DROP TYPE IF EXISTS "public"."enum__lesson_bundles_v_version_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lesson_bundles_lessons_framework_phase" AS ENUM('Predict Phase', 'Observe Phase', 'Explain Phase', 'Driving Question Board (DQB) Creation', 'Model Building Phase');
  CREATE TYPE "public"."enum_lesson_bundles_bump_type" AS ENUM('patch', 'minor', 'major');
  CREATE TYPE "public"."enum_lesson_bundles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__lesson_bundles_v_version_lessons_framework_phase" AS ENUM('Predict Phase', 'Observe Phase', 'Explain Phase', 'Driving Question Board (DQB) Creation', 'Model Building Phase');
  CREATE TYPE "public"."enum__lesson_bundles_v_version_bump_type" AS ENUM('patch', 'minor', 'major');
  CREATE TYPE "public"."enum__lesson_bundles_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "lesson_bundles_lessons_framework" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"phase" "enum_lesson_bundles_lessons_framework_phase",
  	"learner_experience" varchar,
  	"teacher_moves" varchar,
  	"sensemaking_strategy" varchar,
  	"formative_assessment" varchar,
  	"resources_video_title" varchar,
  	"resources_video_direct_url" varchar,
  	"resources_video_search_url" varchar,
  	"resources_reading_title" varchar,
  	"resources_reading_direct_url" varchar,
  	"resources_reading_search_url" varchar
  );
  
  CREATE TABLE "lesson_bundles_lessons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"title" varchar,
  	"duration" varchar,
  	"substrand" varchar,
  	"ares_keywords" varchar,
  	"slo_purpose" varchar,
  	"slo_knowledge" varchar,
  	"slo_skills" varchar,
  	"slo_attitudes" varchar,
  	"slo_key_inquiry" varchar,
  	"slo_purpose_in_storyline" varchar,
  	"slo_safety_notes" varchar,
  	"overview" varchar,
  	"teacher_reflection" varchar,
  	"summary_table_prompt_observed" varchar,
  	"summary_table_prompt_learned" varchar,
  	"summary_table_prompt_explained" varchar
  );
  
  CREATE TABLE "lesson_bundles_final_explanation_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"prompt" varchar,
  	"exemplar" varchar
  );
  
  CREATE TABLE "lesson_bundles_final_explanation_rubric" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"criterion" varchar,
  	"excellent" varchar,
  	"proficient" varchar,
  	"developing" varchar
  );
  
  CREATE TABLE "lesson_bundles_summary_table_lessons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"title" varchar,
  	"observed" varchar,
  	"learned" varchar,
  	"explained" varchar
  );
  
  CREATE TABLE "lesson_bundles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"semver" varchar DEFAULT '1.0.0',
  	"bump_type" "enum_lesson_bundles_bump_type" DEFAULT 'patch',
  	"lock_version" numeric DEFAULT 0,
  	"title" varchar,
  	"subject_grade_id" integer,
  	"meta_subject" varchar,
  	"meta_grade" numeric,
  	"meta_substrand_id" varchar,
  	"meta_substrand_name" varchar,
  	"meta_output_dir" varchar,
  	"meta_file_prefix" varchar,
  	"meta_title_doc" varchar,
  	"meta_subtitle_doc" varchar,
  	"meta_col3_label" varchar,
  	"meta_col5_label" varchar,
  	"unit_grade_level" varchar,
  	"unit_subject" varchar,
  	"unit_strand" varchar,
  	"unit_substrand" varchar,
  	"unit_total_duration" varchar,
  	"unit_content" varchar,
  	"unit_learning_outcomes" varchar,
  	"unit_core_competencies" varchar,
  	"unit_values" varchar,
  	"unit_sep" varchar,
  	"unit_pcis" varchar,
  	"unit_careers" varchar,
  	"unit_focus" varchar,
  	"unit_driving_question" varchar,
  	"unit_phenomenon" varchar,
  	"unit_supporting_phenomena" varchar,
  	"unit_storyline_thread" varchar,
  	"final_explanation_subject_label" varchar,
  	"final_explanation_instructions" varchar,
  	"summary_table_sub_strand" varchar,
  	"summary_table_driving_question" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_lesson_bundles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_lesson_bundles_v_version_lessons_framework" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"phase" "enum__lesson_bundles_v_version_lessons_framework_phase",
  	"learner_experience" varchar,
  	"teacher_moves" varchar,
  	"sensemaking_strategy" varchar,
  	"formative_assessment" varchar,
  	"resources_video_title" varchar,
  	"resources_video_direct_url" varchar,
  	"resources_video_search_url" varchar,
  	"resources_reading_title" varchar,
  	"resources_reading_direct_url" varchar,
  	"resources_reading_search_url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_lesson_bundles_v_version_lessons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"title" varchar,
  	"duration" varchar,
  	"substrand" varchar,
  	"ares_keywords" varchar,
  	"slo_purpose" varchar,
  	"slo_knowledge" varchar,
  	"slo_skills" varchar,
  	"slo_attitudes" varchar,
  	"slo_key_inquiry" varchar,
  	"slo_purpose_in_storyline" varchar,
  	"slo_safety_notes" varchar,
  	"overview" varchar,
  	"teacher_reflection" varchar,
  	"summary_table_prompt_observed" varchar,
  	"summary_table_prompt_learned" varchar,
  	"summary_table_prompt_explained" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_lesson_bundles_v_version_final_explanation_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"prompt" varchar,
  	"exemplar" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_lesson_bundles_v_version_final_explanation_rubric" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"criterion" varchar,
  	"excellent" varchar,
  	"proficient" varchar,
  	"developing" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_lesson_bundles_v_version_summary_table_lessons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"title" varchar,
  	"observed" varchar,
  	"learned" varchar,
  	"explained" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_lesson_bundles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_semver" varchar DEFAULT '1.0.0',
  	"version_bump_type" "enum__lesson_bundles_v_version_bump_type" DEFAULT 'patch',
  	"version_lock_version" numeric DEFAULT 0,
  	"version_title" varchar,
  	"version_subject_grade_id" integer,
  	"version_meta_subject" varchar,
  	"version_meta_grade" numeric,
  	"version_meta_substrand_id" varchar,
  	"version_meta_substrand_name" varchar,
  	"version_meta_output_dir" varchar,
  	"version_meta_file_prefix" varchar,
  	"version_meta_title_doc" varchar,
  	"version_meta_subtitle_doc" varchar,
  	"version_meta_col3_label" varchar,
  	"version_meta_col5_label" varchar,
  	"version_unit_grade_level" varchar,
  	"version_unit_subject" varchar,
  	"version_unit_strand" varchar,
  	"version_unit_substrand" varchar,
  	"version_unit_total_duration" varchar,
  	"version_unit_content" varchar,
  	"version_unit_learning_outcomes" varchar,
  	"version_unit_core_competencies" varchar,
  	"version_unit_values" varchar,
  	"version_unit_sep" varchar,
  	"version_unit_pcis" varchar,
  	"version_unit_careers" varchar,
  	"version_unit_focus" varchar,
  	"version_unit_driving_question" varchar,
  	"version_unit_phenomenon" varchar,
  	"version_unit_supporting_phenomena" varchar,
  	"version_unit_storyline_thread" varchar,
  	"version_final_explanation_subject_label" varchar,
  	"version_final_explanation_instructions" varchar,
  	"version_summary_table_sub_strand" varchar,
  	"version_summary_table_driving_question" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__lesson_bundles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'generateArtifact');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'generateArtifact');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lesson_bundles_id" integer;
  ALTER TABLE "lesson_bundles_lessons_framework" ADD CONSTRAINT "lesson_bundles_lessons_framework_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles_lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles_lessons" ADD CONSTRAINT "lesson_bundles_lessons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles_final_explanation_sections" ADD CONSTRAINT "lesson_bundles_final_explanation_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles_final_explanation_rubric" ADD CONSTRAINT "lesson_bundles_final_explanation_rubric_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles_summary_table_lessons" ADD CONSTRAINT "lesson_bundles_summary_table_lessons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles" ADD CONSTRAINT "lesson_bundles_subject_grade_id_subject_grades_id_fk" FOREIGN KEY ("subject_grade_id") REFERENCES "public"."subject_grades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_lesson_bundles_v_version_lessons_framework" ADD CONSTRAINT "_lesson_bundles_v_version_lessons_framework_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_lesson_bundles_v_version_lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lesson_bundles_v_version_lessons" ADD CONSTRAINT "_lesson_bundles_v_version_lessons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_lesson_bundles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lesson_bundles_v_version_final_explanation_sections" ADD CONSTRAINT "_lesson_bundles_v_version_final_explanation_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_lesson_bundles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lesson_bundles_v_version_final_explanation_rubric" ADD CONSTRAINT "_lesson_bundles_v_version_final_explanation_rubric_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_lesson_bundles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lesson_bundles_v_version_summary_table_lessons" ADD CONSTRAINT "_lesson_bundles_v_version_summary_table_lessons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_lesson_bundles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_lesson_bundles_v" ADD CONSTRAINT "_lesson_bundles_v_parent_id_lesson_bundles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_lesson_bundles_v" ADD CONSTRAINT "_lesson_bundles_v_version_subject_grade_id_subject_grades_id_fk" FOREIGN KEY ("version_subject_grade_id") REFERENCES "public"."subject_grades"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lesson_bundles_lessons_framework_order_idx" ON "lesson_bundles_lessons_framework" USING btree ("_order");
  CREATE INDEX "lesson_bundles_lessons_framework_parent_id_idx" ON "lesson_bundles_lessons_framework" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundles_lessons_order_idx" ON "lesson_bundles_lessons" USING btree ("_order");
  CREATE INDEX "lesson_bundles_lessons_parent_id_idx" ON "lesson_bundles_lessons" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundles_final_explanation_sections_order_idx" ON "lesson_bundles_final_explanation_sections" USING btree ("_order");
  CREATE INDEX "lesson_bundles_final_explanation_sections_parent_id_idx" ON "lesson_bundles_final_explanation_sections" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundles_final_explanation_rubric_order_idx" ON "lesson_bundles_final_explanation_rubric" USING btree ("_order");
  CREATE INDEX "lesson_bundles_final_explanation_rubric_parent_id_idx" ON "lesson_bundles_final_explanation_rubric" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundles_summary_table_lessons_order_idx" ON "lesson_bundles_summary_table_lessons" USING btree ("_order");
  CREATE INDEX "lesson_bundles_summary_table_lessons_parent_id_idx" ON "lesson_bundles_summary_table_lessons" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundles_subject_grade_idx" ON "lesson_bundles" USING btree ("subject_grade_id");
  CREATE INDEX "lesson_bundles_updated_at_idx" ON "lesson_bundles" USING btree ("updated_at");
  CREATE INDEX "lesson_bundles_created_at_idx" ON "lesson_bundles" USING btree ("created_at");
  CREATE INDEX "lesson_bundles__status_idx" ON "lesson_bundles" USING btree ("_status");
  CREATE INDEX "_lesson_bundles_v_version_lessons_framework_order_idx" ON "_lesson_bundles_v_version_lessons_framework" USING btree ("_order");
  CREATE INDEX "_lesson_bundles_v_version_lessons_framework_parent_id_idx" ON "_lesson_bundles_v_version_lessons_framework" USING btree ("_parent_id");
  CREATE INDEX "_lesson_bundles_v_version_lessons_order_idx" ON "_lesson_bundles_v_version_lessons" USING btree ("_order");
  CREATE INDEX "_lesson_bundles_v_version_lessons_parent_id_idx" ON "_lesson_bundles_v_version_lessons" USING btree ("_parent_id");
  CREATE INDEX "_lesson_bundles_v_version_final_explanation_sections_order_idx" ON "_lesson_bundles_v_version_final_explanation_sections" USING btree ("_order");
  CREATE INDEX "_lesson_bundles_v_version_final_explanation_sections_parent_id_idx" ON "_lesson_bundles_v_version_final_explanation_sections" USING btree ("_parent_id");
  CREATE INDEX "_lesson_bundles_v_version_final_explanation_rubric_order_idx" ON "_lesson_bundles_v_version_final_explanation_rubric" USING btree ("_order");
  CREATE INDEX "_lesson_bundles_v_version_final_explanation_rubric_parent_id_idx" ON "_lesson_bundles_v_version_final_explanation_rubric" USING btree ("_parent_id");
  CREATE INDEX "_lesson_bundles_v_version_summary_table_lessons_order_idx" ON "_lesson_bundles_v_version_summary_table_lessons" USING btree ("_order");
  CREATE INDEX "_lesson_bundles_v_version_summary_table_lessons_parent_id_idx" ON "_lesson_bundles_v_version_summary_table_lessons" USING btree ("_parent_id");
  CREATE INDEX "_lesson_bundles_v_parent_idx" ON "_lesson_bundles_v" USING btree ("parent_id");
  CREATE INDEX "_lesson_bundles_v_version_version_subject_grade_idx" ON "_lesson_bundles_v" USING btree ("version_subject_grade_id");
  CREATE INDEX "_lesson_bundles_v_version_version_updated_at_idx" ON "_lesson_bundles_v" USING btree ("version_updated_at");
  CREATE INDEX "_lesson_bundles_v_version_version_created_at_idx" ON "_lesson_bundles_v" USING btree ("version_created_at");
  CREATE INDEX "_lesson_bundles_v_version_version__status_idx" ON "_lesson_bundles_v" USING btree ("version__status");
  CREATE INDEX "_lesson_bundles_v_created_at_idx" ON "_lesson_bundles_v" USING btree ("created_at");
  CREATE INDEX "_lesson_bundles_v_updated_at_idx" ON "_lesson_bundles_v" USING btree ("updated_at");
  CREATE INDEX "_lesson_bundles_v_latest_idx" ON "_lesson_bundles_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lesson_bundles_fk" FOREIGN KEY ("lesson_bundles_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_lesson_bundles_id_idx" ON "payload_locked_documents_rels" USING btree ("lesson_bundles_id");`)
}
