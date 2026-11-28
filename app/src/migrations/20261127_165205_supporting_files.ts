import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_supporting_files_kind" AS ENUM (
      'quick-check', 'answer-key', 'student-materials', 'materials-teacher-key',
      'assessment-materials', 'deck-art', 'other'
    );

    CREATE TABLE "supporting_files" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "lesson_plan_id" integer NOT NULL,
      "lesson_number" numeric,
      "kind" "public"."enum_supporting_files_kind" NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "url" varchar,
      "thumbnail_u_r_l" varchar,
      "filename" varchar,
      "mime_type" varchar,
      "filesize" numeric,
      "width" numeric,
      "height" numeric
    );

    ALTER TABLE "supporting_files" ADD CONSTRAINT "supporting_files_lesson_plan_id_lesson_plans_id_fk"
      FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "supporting_files_lesson_plan_idx" ON "supporting_files" USING btree ("lesson_plan_id");
    CREATE INDEX "supporting_files_updated_at_idx" ON "supporting_files" USING btree ("updated_at");
    CREATE INDEX "supporting_files_created_at_idx" ON "supporting_files" USING btree ("created_at");
    CREATE UNIQUE INDEX "supporting_files_filename_idx" ON "supporting_files" USING btree ("filename");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "supporting_files";
    DROP TYPE "public"."enum_supporting_files_kind";
  `)
}
