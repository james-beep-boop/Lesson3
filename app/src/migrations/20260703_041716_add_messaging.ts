import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds the `messages` collection (§10 PR ③ — internal messaging: flat rows, sender/recipient FKs,
 * optional lesson-plan/version links, `read_at`) plus the `messagePing` task slug on the two
 * payload-jobs enums and the locked-documents wiring Payload adds for every collection. Generated
 * on the Rock (deps image, Node 22), then guarded so up/down are idempotent (project rule):
 * `IF NOT EXISTS` throughout, `ADD VALUE IF NOT EXISTS` on the enums (PG12+ allows it in the
 * migration transaction as long as the value isn't used in that same transaction — it isn't).
 * `down` drops only what this migration owns, deleting the feature's job rows first (the enum
 * rebuild's USING cast would otherwise fail on them).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'messagePing';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'messagePing';
  CREATE TABLE IF NOT EXISTS "messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"sender_id" integer NOT NULL,
  	"recipient_id" integer NOT NULL,
  	"body" varchar NOT NULL,
  	"lesson_plan_id" integer,
  	"version_id" integer,
  	"read_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "messages_id" integer;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_id_users_id_fk') THEN
      ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk"
        FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_recipient_id_users_id_fk') THEN
      ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_users_id_fk"
        FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_lesson_plan_id_lesson_plans_id_fk') THEN
      ALTER TABLE "messages" ADD CONSTRAINT "messages_lesson_plan_id_lesson_plans_id_fk"
        FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_version_id_lesson_bundle_versions_id_fk') THEN
      ALTER TABLE "messages" ADD CONSTRAINT "messages_version_id_lesson_bundle_versions_id_fk"
        FOREIGN KEY ("version_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_messages_fk') THEN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_messages_fk"
        FOREIGN KEY ("messages_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS "messages_sender_idx" ON "messages" USING btree ("sender_id");
  CREATE INDEX IF NOT EXISTS "messages_recipient_idx" ON "messages" USING btree ("recipient_id");
  CREATE INDEX IF NOT EXISTS "messages_lesson_plan_idx" ON "messages" USING btree ("lesson_plan_id");
  CREATE INDEX IF NOT EXISTS "messages_version_idx" ON "messages" USING btree ("version_id");
  CREATE INDEX IF NOT EXISTS "messages_updated_at_idx" ON "messages" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("messages_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "messages" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_messages_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_messages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "messages_id";

  DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'messagePing';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'messagePing';
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'generateVersionArtifact', 'emailVersionArtifact');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'generateVersionArtifact', 'emailVersionArtifact');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
