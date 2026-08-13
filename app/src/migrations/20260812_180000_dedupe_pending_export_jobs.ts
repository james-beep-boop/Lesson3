import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Make the in-flight export coalescing invariant atomic. Application-level find-then-enqueue cannot
 * serialize two requests; this partial expression index permits one pending job per immutable
 * version and output kind while allowing completed/failed jobs to remain as history.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- A prior application race may already have left duplicate pending rows. They target the same
    -- immutable artifact, so retain the oldest job and remove redundant copies before installing
    -- the invariant (payload_jobs_log cascades with its parent).
    WITH ranked AS (
      SELECT "id",
        ROW_NUMBER() OVER (
          PARTITION BY "input" ->> 'versionId', "input" ->> 'kind'
          ORDER BY "id"
        ) AS duplicate_rank
      FROM "payload_jobs"
      WHERE "task_slug" = 'generateVersionArtifact'
        AND "completed_at" IS NULL
        AND "has_error" IS NOT TRUE
        AND "input" ->> 'versionId' IS NOT NULL
        AND "input" ->> 'kind' IS NOT NULL
    )
    DELETE FROM "payload_jobs"
    WHERE "id" IN (SELECT "id" FROM ranked WHERE duplicate_rank > 1);

    CREATE UNIQUE INDEX "payload_jobs_generate_version_artifact_pending_unique"
    ON "payload_jobs" (("input" ->> 'versionId'), ("input" ->> 'kind'))
    WHERE "task_slug" = 'generateVersionArtifact'
      AND "completed_at" IS NULL
      AND "has_error" IS NOT TRUE
      AND "input" ->> 'versionId' IS NOT NULL
      AND "input" ->> 'kind' IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload_jobs_generate_version_artifact_pending_unique";
  `)
}
