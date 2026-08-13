import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'expireEditRecovery' BEFORE 'messagePing';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'expireEditRecovery' BEFORE 'messagePing';
  CREATE TABLE "edit_recovery" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"source_version_id" integer NOT NULL,
  	"lesson_plan_id" integer NOT NULL,
  	"generation" numeric NOT NULL,
  	"revision" numeric NOT NULL,
  	"retired_at" timestamp(3) with time zone,
  	"base_updated_at" timestamp(3) with time zone NOT NULL,
  	"schema_version" varchar NOT NULL,
  	"content" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_jobs" ADD COLUMN "meta" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "edit_recovery_id" integer;
  ALTER TABLE "edit_recovery" ADD CONSTRAINT "edit_recovery_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "edit_recovery" ADD CONSTRAINT "edit_recovery_source_version_id_lesson_bundle_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "edit_recovery" ADD CONSTRAINT "edit_recovery_lesson_plan_id_lesson_plans_id_fk" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "edit_recovery_user_idx" ON "edit_recovery" USING btree ("user_id");
  CREATE INDEX "edit_recovery_source_version_idx" ON "edit_recovery" USING btree ("source_version_id");
  CREATE INDEX "edit_recovery_lesson_plan_idx" ON "edit_recovery" USING btree ("lesson_plan_id");
  CREATE INDEX "edit_recovery_retired_at_idx" ON "edit_recovery" USING btree ("retired_at");
  CREATE INDEX "edit_recovery_updated_at_idx" ON "edit_recovery" USING btree ("updated_at");
  CREATE INDEX "edit_recovery_created_at_idx" ON "edit_recovery" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_sourceVersion_idx" ON "edit_recovery" USING btree ("user_id","source_version_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_edit_recovery_fk" FOREIGN KEY ("edit_recovery_id") REFERENCES "public"."edit_recovery"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_edit_recovery_id_idx" ON "payload_locked_documents_rels" USING btree ("edit_recovery_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "edit_recovery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_stats" DISABLE ROW LEVEL SECURITY;
  -- ⚑ HAND-EDITED, and the order is the edit. Payload's generator emitted this DROP CONSTRAINT
  -- AFTER DROP TABLE "edit_recovery" CASCADE, which cannot execute: the CASCADE has already
  -- removed this very constraint, so the explicit drop fails with
  -- constraint ... does not exist and the whole rollback aborts. Caught by actually running
  -- migrate:down rather than reading the file. Do not "tidy" it back below the DROP TABLE.
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_edit_recovery_fk";
  DROP TABLE "edit_recovery" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  
  -- ⚑ HAND-EDITED. The enum shrink below casts EXISTING rows into the reduced type, so any row
  -- carrying 'expireEditRecovery' makes the whole rollback fail with "invalid input value for enum".
  -- Once the scheduled task has run even once, payload_jobs and payload_jobs_log contain exactly such
  -- rows — so the generated down worked ONLY on a database where the app had never started.
  -- Reproduced by inserting one row and watching the rollback abort.
  -- Logs first: they reference jobs via _parent_id.
  -- (No backticks anywhere in these comments: this is inside a tagged template literal, and a raw
  -- backtick terminates it. That has now broken this file twice and kernel.ts once — including the
  -- comment that said so.)
  DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'expireEditRecovery';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'expireEditRecovery';

  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'generateVersionArtifact', 'emailVersionArtifact', 'messagePing', 'passwordResetEmail');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'generateVersionArtifact', 'emailVersionArtifact', 'messagePing', 'passwordResetEmail');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_edit_recovery_id_idx";
  ALTER TABLE "payload_jobs" DROP COLUMN "meta";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "edit_recovery_id";`)
}
