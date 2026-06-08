import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_roles" AS ENUM('siteAdmin');
  CREATE TYPE "public"."enum_users_assignments_role" AS ENUM('subjectAdmin', 'editor');
  CREATE TYPE "public"."enum_lesson_bundles_lessons_framework_phase" AS ENUM('Predict Phase', 'Observe Phase', 'Explain Phase', 'Driving Question Board (DQB) Creation', 'Model Building Phase');
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_assignments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"subject_grade_id" integer NOT NULL,
  	"role" "enum_users_assignments_role" NOT NULL
  );
  
  CREATE TABLE "subjects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subject_grades" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject_id" integer NOT NULL,
  	"grade" numeric NOT NULL,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lesson_bundles_lessons_framework" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"phase" "enum_lesson_bundles_lessons_framework_phase" NOT NULL,
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
  	"unit_overview" varchar,
  	"final_explanation_subject_label" varchar,
  	"final_explanation_instructions" varchar,
  	"summary_table_sub_strand" varchar,
  	"summary_table_driving_question" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  -- Add nullable, backfill existing rows from email, then enforce NOT NULL.
  -- (A bare "ADD COLUMN name varchar NOT NULL" fails on a table that already has rows.)
  ALTER TABLE "users" ADD COLUMN "name" varchar;
  UPDATE "users" SET "name" = "email" WHERE "name" IS NULL;
  ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subjects_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subject_grades_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lesson_bundles_id" integer;
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_assignments" ADD CONSTRAINT "users_assignments_subject_grade_id_subject_grades_id_fk" FOREIGN KEY ("subject_grade_id") REFERENCES "public"."subject_grades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_assignments" ADD CONSTRAINT "users_assignments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "subject_grades" ADD CONSTRAINT "subject_grades_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_bundles_lessons_framework" ADD CONSTRAINT "lesson_bundles_lessons_framework_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles_lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles_lessons" ADD CONSTRAINT "lesson_bundles_lessons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles_final_explanation_sections" ADD CONSTRAINT "lesson_bundles_final_explanation_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles_final_explanation_rubric" ADD CONSTRAINT "lesson_bundles_final_explanation_rubric_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles_summary_table_lessons" ADD CONSTRAINT "lesson_bundles_summary_table_lessons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_bundles" ADD CONSTRAINT "lesson_bundles_subject_grade_id_subject_grades_id_fk" FOREIGN KEY ("subject_grade_id") REFERENCES "public"."subject_grades"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_assignments_order_idx" ON "users_assignments" USING btree ("_order");
  CREATE INDEX "users_assignments_parent_id_idx" ON "users_assignments" USING btree ("_parent_id");
  CREATE INDEX "users_assignments_subject_grade_idx" ON "users_assignments" USING btree ("subject_grade_id");
  CREATE UNIQUE INDEX "subjects_name_idx" ON "subjects" USING btree ("name");
  CREATE UNIQUE INDEX "subjects_slug_idx" ON "subjects" USING btree ("slug");
  CREATE INDEX "subjects_updated_at_idx" ON "subjects" USING btree ("updated_at");
  CREATE INDEX "subjects_created_at_idx" ON "subjects" USING btree ("created_at");
  CREATE INDEX "subject_grades_subject_idx" ON "subject_grades" USING btree ("subject_id");
  CREATE INDEX "subject_grades_updated_at_idx" ON "subject_grades" USING btree ("updated_at");
  CREATE INDEX "subject_grades_created_at_idx" ON "subject_grades" USING btree ("created_at");
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
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subjects_fk" FOREIGN KEY ("subjects_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subject_grades_fk" FOREIGN KEY ("subject_grades_id") REFERENCES "public"."subject_grades"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lesson_bundles_fk" FOREIGN KEY ("lesson_bundles_id") REFERENCES "public"."lesson_bundles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_subjects_id_idx" ON "payload_locked_documents_rels" USING btree ("subjects_id");
  CREATE INDEX "payload_locked_documents_rels_subject_grades_id_idx" ON "payload_locked_documents_rels" USING btree ("subject_grades_id");
  CREATE INDEX "payload_locked_documents_rels_lesson_bundles_id_idx" ON "payload_locked_documents_rels" USING btree ("lesson_bundles_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_roles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "users_assignments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subjects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subject_grades" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_lessons_framework" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_final_explanation_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_final_explanation_rubric" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles_summary_table_lessons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_bundles" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_assignments" CASCADE;
  DROP TABLE "subjects" CASCADE;
  DROP TABLE "subject_grades" CASCADE;
  DROP TABLE "lesson_bundles_lessons_framework" CASCADE;
  DROP TABLE "lesson_bundles_lessons" CASCADE;
  DROP TABLE "lesson_bundles_final_explanation_sections" CASCADE;
  DROP TABLE "lesson_bundles_final_explanation_rubric" CASCADE;
  DROP TABLE "lesson_bundles_summary_table_lessons" CASCADE;
  DROP TABLE "lesson_bundles" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subjects_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subject_grades_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_lesson_bundles_fk";
  
  DROP INDEX "payload_locked_documents_rels_subjects_id_idx";
  DROP INDEX "payload_locked_documents_rels_subject_grades_id_idx";
  DROP INDEX "payload_locked_documents_rels_lesson_bundles_id_idx";
  ALTER TABLE "users" DROP COLUMN "name";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subjects_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subject_grades_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lesson_bundles_id";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_users_assignments_role";
  DROP TYPE "public"."enum_lesson_bundles_lessons_framework_phase";`)
}
