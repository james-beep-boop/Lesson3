/**
 * `generateVersionArtifact` task — the version-model counterpart to `generateArtifact`.
 *
 * Same async/throttled contract (a cold export ENQUEUES this and returns 202; the in-process
 * `autoRun` runner picks it up, bounded by the queue `limit`), but keyed on an immutable
 * `lesson-bundle-version` instead of a legacy bundle + lockVersion. Because a version never
 * changes, the cache scope includes the explicit renderer revision
 * (`render:<generatorVersion>:version:<id>`), so a generator re-pin invalidates old artifacts.
 * The job writes artifacts + manifest into the
 * cache; the status poll and warm path then serve them. Output carries nothing (bytes live only
 * in the cache, never the DB).
 *
 * TRUST: runs as a system path. Authorization (caller READ access) is enforced at ENQUEUE time
 * by the version export endpoint; the task itself uses overrideAccess.
 */
import type { Payload, TaskConfig } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import {
  assertExportKind,
  produceArtifacts,
  safePrefix,
  versionScope,
  type ArtifactSpec,
  type ExportKind,
} from '../generator/exportArtifacts'
import { generateFromVersionSnapshot } from '../generator/generateForVersion'
import { docxToPdf } from '../generator/docxToPdf'
import { captureException } from '../lib/errorTracking'
import { rowsOf } from '../lib/txDb'
import type { LessonBundleVersion, PayloadJob } from '../payload-types'

export interface GenerateVersionArtifactInput {
  versionId: number
  kind: ExportKind
}

export const GENERATE_VERSION_ARTIFACT_SLUG = 'generateVersionArtifact' as const

export const generateVersionArtifactTask: TaskConfig<{
  input: GenerateVersionArtifactInput
  output: object
}> = {
  slug: GENERATE_VERSION_ARTIFACT_SLUG,
  retries: 0,
  inputSchema: [
    { name: 'versionId', type: 'number', required: true },
    { name: 'kind', type: 'text', required: true },
  ],
  handler: async ({ input, req }) => {
    const { versionId, kind } = input
    try {
      assertExportKind(kind) // the inputSchema is `text` — reject a bad row before any cache write

      // A VANISHED VERSION IS A NO-OP, NOT A FAILURE (L3-03 follow-up, 2026-07-21).
      // `prewarmVersionArtifacts` enqueues OUTSIDE the caller's transaction, so a pre-warm job can
      // legitimately outlive an ingest or promotion that later rolled back, leaving its input pointing
      // at a version row that no longer exists. The L3-03 design accepts that outcome explicitly; the
      // right response is to do nothing (there is nothing to generate, and nothing to retry), not to
      // page someone. Treating it as a failure trains people to ignore this job's captures — which are
      // also how a GENUINE generator failure surfaces. Same call the `messagePing` task makes when its
      // message is gone.
      //
      // Classified AT THE BOUNDARY: `disableErrors` turns only "no such row" into `null`, so every
      // other error — including a real generator fault below — still takes the capture + rethrow path.
      // This one read is authoritative: the loaded snapshot is passed straight into
      // `generateFromVersionSnapshot` below (the pure, fetch-free variant), so generation never
      // re-reads the row and a delete landing after this gate cannot turn a legitimate no-op into a
      // captured NotFound.
      const version = (await req.payload.findByID({
        collection: 'lesson-bundle-versions',
        id: versionId,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
      })) as LessonBundleVersion | null
      if (!version) {
        req.payload.logger.info(
          { versionId, kind },
          'generateVersionArtifact skipped — version no longer exists (write rolled back after enqueue)',
        )
        return { output: {} }
      }

      const spec: ArtifactSpec = { scope: versionScope(versionId), kind }
      const generated = await generateFromVersionSnapshot(version)
      await produceArtifacts(spec, generated, safePrefix(version.meta?.filePrefix), docxToPdf)
      return { output: {} }
    } catch (err) {
      // Surface the failure in the structured log WITH context. The payload-jobs row records the
      // failure too, but without these fields (and isn't in the log stream). Rethrow so the job is
      // still marked failed — `retries: 0`, so a failed export stays failed for the status poll.
      req.payload.logger.error({ err, versionId, kind }, 'generateVersionArtifact failed')
      captureException(err, { job: 'generateVersionArtifact', versionId, kind })
      throw err
    }
  },
}

/**
 * Is `job` a `generateVersionArtifact` job for `versionId`? `payload-jobs.input` is a JSON column, so
 * read `versionId` off it as a scalar (not a Payload relationship — `relId`/`toId` don't apply). Shared
 * by the export status-binding check, the prepare dedupe, and pre-warm — homed here beside the task
 * symbols it interrogates.
 */
export function jobMatchesVersion(job: PayloadJob | null | undefined, versionId: number | string): boolean {
  const input = job?.input as { versionId?: number | string } | undefined
  return (
    job?.taskSlug === GENERATE_VERSION_ARTIFACT_SLUG &&
    String(input?.versionId ?? '') === String(versionId)
  )
}

/** Does `job` target this exact {versionId, kind} spec? */
export function jobMatchesSpec(job: PayloadJob, input: GenerateVersionArtifactInput): boolean {
  const i = job.input as { kind?: string } | undefined
  return jobMatchesVersion(job, input.versionId) && i?.kind === input.kind
}

/**
 * The in-flight job matching this exact spec, or null. Query the JSON scalars directly: a bounded
 * Payload page can miss the match during a backlog and re-open the duplicate-enqueue window.
 */
export async function findPendingExportJob(
  payload: Payload,
  input: GenerateVersionArtifactInput,
): Promise<PayloadJob | null> {
  const adapter = payload.db as unknown as {
    drizzle: { execute: (query: unknown) => Promise<unknown> }
  }
  const result = await adapter.drizzle.execute(sql`
    SELECT "id"
    FROM "payload_jobs"
    WHERE "task_slug" = ${GENERATE_VERSION_ARTIFACT_SLUG}
      AND "completed_at" IS NULL
      AND "has_error" IS NOT TRUE
      AND "input" ->> 'versionId' = ${String(input.versionId)}
      AND "input" ->> 'kind' = ${input.kind}
    ORDER BY "id" DESC
    LIMIT 1
  `)
  const id = rowsOf(result)[0]?.id
  if (typeof id !== 'number' && typeof id !== 'string') return null
  return payload.findByID({
    collection: 'payload-jobs',
    id,
    depth: 0,
    overrideAccess: true,
  })
}

export const PENDING_EXPORT_JOB_UNIQUE_INDEX =
  'payload_jobs_generate_version_artifact_pending_unique'

/** True only for the migration-backed pending-export uniqueness conflict. */
export function isPendingExportJobConflict(error: unknown): boolean {
  let current: unknown = error
  const seen = new Set<unknown>()
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { code?: unknown; constraint?: unknown; cause?: unknown }
    if (
      record.code === '23505' && record.constraint === PENDING_EXPORT_JOB_UNIQUE_INDEX
    ) {
      return true
    }
    current = record.cause
  }
  return false
}
