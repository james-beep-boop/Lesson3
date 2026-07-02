import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds the `emailVersionArtifact` task slug (§10 PR ② email-a-doc) to the two payload-jobs enums.
 * Generated on the Rock (deps image, Node 22), then guarded so up/down are idempotent (project
 * rule): `ADD VALUE IF NOT EXISTS` on up; down first deletes any rows carrying the removed slug
 * (they belong to the removed feature — the generated USING cast would otherwise fail on them),
 * then rebuilds the enums without it. PG12+ allows ADD VALUE inside the migration transaction as
 * long as the new value isn't used in that same transaction (it isn't).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'emailVersionArtifact';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'emailVersionArtifact';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'emailVersionArtifact';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'emailVersionArtifact';
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'generateVersionArtifact');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'generateVersionArtifact');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
