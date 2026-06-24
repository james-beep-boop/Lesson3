import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lesson_bundle_versions_lessons_framework_phase" AS ENUM('Predict Phase', 'Observe Phase', 'Explain Phase', 'Driving Question Board (DQB) Creation', 'Model Building Phase');
  CREATE TABLE "lesson_plans" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"subject_grade_id" integer NOT NULL,
  	"official_version_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lesson_bundle_versions_lessons_framework" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"phase" "enum_lesson_bundle_versions_lessons_framework_phase" NOT NULL,
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
  
  CREATE TABLE "lesson_bundle_versions_lessons" (
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
  
  CREATE TABLE "lesson_bundle_versions_final_explanation_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"prompt" varchar,
  	"exemplar" varchar
  );
  
  CREATE TABLE "lesson_bundle_versions_final_explanation_rubric" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"criterion" varchar,
  	"excellent" varchar,
  	"proficient" varchar,
  	"developing" varchar
  );
  
  CREATE TABLE "lesson_bundle_versions_summary_table_lessons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"title" varchar,
  	"observed" varchar,
  	"learned" varchar,
  	"explained" varchar
  );
  
  CREATE TABLE "lesson_bundle_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lesson_plan_id" integer NOT NULL,
  	"source_version_id" integer,
  	"semver" varchar DEFAULT '1.0.0' NOT NULL,
  	"title" varchar NOT NULL,
  	"subject_grade_id" integer NOT NULL,
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
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lesson_plans_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lesson_bundle_versions_id" integer;
  ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subject_grade_id_subject_grades_id_fk" FOREIGN KEY ("subject_grade_id") REFERENCES "public"."subject_grades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_official_version_id_lesson_bundle_versions_id_fk" FOREIGN KEY ("official_version_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_bundle_versions_lessons_framework" ADD CONSTRAINT "lesson_bundle_versions_lessons_framework_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundle_versions_lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundle_versions_lessons" ADD CONSTRAINT "lesson_bundle_versions_lessons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundle_versions_final_explanation_sections" ADD CONSTRAINT "lesson_bundle_versions_final_explanation_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundle_versions_final_explanation_rubric" ADD CONSTRAINT "lesson_bundle_versions_final_explanation_rubric_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundle_versions_summary_table_lessons" ADD CONSTRAINT "lesson_bundle_versions_summary_table_lessons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundle_versions" ADD CONSTRAINT "lesson_bundle_versions_lesson_plan_id_lesson_plans_id_fk" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_bundle_versions" ADD CONSTRAINT "lesson_bundle_versions_source_version_id_lesson_bundle_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_bundle_versions" ADD CONSTRAINT "lesson_bundle_versions_subject_grade_id_subject_grades_id_fk" FOREIGN KEY ("subject_grade_id") REFERENCES "public"."subject_grades"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lesson_plans_subject_grade_idx" ON "lesson_plans" USING btree ("subject_grade_id");
  CREATE INDEX "lesson_plans_official_version_idx" ON "lesson_plans" USING btree ("official_version_id");
  CREATE INDEX "lesson_plans_updated_at_idx" ON "lesson_plans" USING btree ("updated_at");
  CREATE INDEX "lesson_plans_created_at_idx" ON "lesson_plans" USING btree ("created_at");
  CREATE INDEX "lesson_bundle_versions_lessons_framework_order_idx" ON "lesson_bundle_versions_lessons_framework" USING btree ("_order");
  CREATE INDEX "lesson_bundle_versions_lessons_framework_parent_id_idx" ON "lesson_bundle_versions_lessons_framework" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundle_versions_lessons_order_idx" ON "lesson_bundle_versions_lessons" USING btree ("_order");
  CREATE INDEX "lesson_bundle_versions_lessons_parent_id_idx" ON "lesson_bundle_versions_lessons" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundle_versions_final_explanation_sections_order_idx" ON "lesson_bundle_versions_final_explanation_sections" USING btree ("_order");
  CREATE INDEX "lesson_bundle_versions_final_explanation_sections_parent_id_idx" ON "lesson_bundle_versions_final_explanation_sections" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundle_versions_final_explanation_rubric_order_idx" ON "lesson_bundle_versions_final_explanation_rubric" USING btree ("_order");
  CREATE INDEX "lesson_bundle_versions_final_explanation_rubric_parent_id_idx" ON "lesson_bundle_versions_final_explanation_rubric" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundle_versions_summary_table_lessons_order_idx" ON "lesson_bundle_versions_summary_table_lessons" USING btree ("_order");
  CREATE INDEX "lesson_bundle_versions_summary_table_lessons_parent_id_idx" ON "lesson_bundle_versions_summary_table_lessons" USING btree ("_parent_id");
  CREATE INDEX "lesson_bundle_versions_lesson_plan_idx" ON "lesson_bundle_versions" USING btree ("lesson_plan_id");
  CREATE INDEX "lesson_bundle_versions_source_version_idx" ON "lesson_bundle_versions" USING btree ("source_version_id");
  CREATE INDEX "lesson_bundle_versions_semver_idx" ON "lesson_bundle_versions" USING btree ("semver");
  CREATE INDEX "lesson_bundle_versions_subject_grade_idx" ON "lesson_bundle_versions" USING btree ("subject_grade_id");
  CREATE INDEX "lesson_bundle_versions_updated_at_idx" ON "lesson_bundle_versions" USING btree ("updated_at");
  CREATE INDEX "lesson_bundle_versions_created_at_idx" ON "lesson_bundle_versions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lesson_plans_fk" FOREIGN KEY ("lesson_plans_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lesson_bundle_versions_fk" FOREIGN KEY ("lesson_bundle_versions_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_lesson_plans_id_idx" ON "payload_locked_documents_rels" USING btree ("lesson_plans_id");
  CREATE INDEX "payload_locked_documents_rels_lesson_bundle_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("lesson_bundle_versions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lesson_plans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundle_versions_lessons_framework" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundle_versions_lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundle_versions_final_explanation_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundle_versions_final_explanation_rubric" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundle_versions_summary_table_lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundle_versions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "lesson_plans" CASCADE;
  DROP TABLE "lesson_bundle_versions_lessons_framework" CASCADE;
  DROP TABLE "lesson_bundle_versions_lessons" CASCADE;
  DROP TABLE "lesson_bundle_versions_final_explanation_sections" CASCADE;
  DROP TABLE "lesson_bundle_versions_final_explanation_rubric" CASCADE;
  DROP TABLE "lesson_bundle_versions_summary_table_lessons" CASCADE;
  DROP TABLE "lesson_bundle_versions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_lesson_plans_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_lesson_bundle_versions_fk";
  
  DROP INDEX "payload_locked_documents_rels_lesson_plans_id_idx";
  DROP INDEX "payload_locked_documents_rels_lesson_bundle_versions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lesson_plans_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lesson_bundle_versions_id";
  DROP TYPE "public"."enum_lesson_bundle_versions_lessons_framework_phase";`)
}
