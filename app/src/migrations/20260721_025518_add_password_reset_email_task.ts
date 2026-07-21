import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'passwordResetEmail';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'passwordResetEmail';`)
}

/**
 * Rolling back REMOVES 'passwordResetEmail' from both enums by casting the column back to a reduced
 * type. That cast fails outright on any surviving row carrying the value — and such rows are not
 * hypothetical: a job whose retries are EXHAUSTED is deliberately retained for diagnosis, which is
 * exactly the SMTP-outage case `passwordResetEmail` exists to survive. So the most likely time to
 * need this rollback is precisely when the rows blocking it exist (flagged in the 2026-07-21 review).
 *
 * We delete those rows first. That is the honest semantics rather than data loss: after the rollback
 * the task no longer exists, so a retained `passwordResetEmail` job could never be run or retried by
 * anyone. Nothing recoverable is discarded — and the reset TOKEN never lived in the job row in the
 * first place (see `jobs/passwordResetEmail.ts`), so the delete leaks nothing and strands no user:
 * the token still sits on the user record, and anyone affected can simply request a new reset.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'passwordResetEmail';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'passwordResetEmail';
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'generateVersionArtifact', 'emailVersionArtifact', 'messagePing');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'generateVersionArtifact', 'emailVersionArtifact', 'messagePing');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
