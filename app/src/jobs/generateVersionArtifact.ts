/**
 * `generateVersionArtifact` task — the version-model counterpart to `generateArtifact`.
 *
 * Same async/throttled contract (a cold export ENQUEUES this and returns 202; the in-process
 * `autoRun` runner picks it up, bounded by the queue `limit`), but keyed on an immutable
 * `lesson-bundle-version` instead of a legacy bundle + lockVersion. Because a version never
 * changes, its cache scope (`version:<id>`) needs no cache-buster, so there is no stale-key
 * drift to reason about (unlike the bundle job). The job writes artifacts + manifest into the
 * cache; the status poll and warm path then serve them. Output carries nothing (bytes live only
 * in the cache, never the DB).
 *
 * TRUST: runs as a system path. Authorization (caller READ access) is enforced at ENQUEUE time
 * by the version export endpoint; the task itself uses overrideAccess.
 */
import type { Payload, TaskConfig } from 'payload'

import {
  produceArtifacts,
  safePrefix,
  versionScope,
  type ArtifactSpec,
  type ExportKind,
} from '../generator/exportArtifacts'
import { generateForVersion } from '../generator/generateForVersion'
import { docxToPdf } from '../generator/docxToPdf'
import { captureException } from '../lib/errorTracking'
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
      const spec: ArtifactSpec = { scope: versionScope(versionId), kind }
      // Generation and the prefix read are independent — run them concurrently.
      const [generated, version] = await Promise.all([
        generateForVersion(req.payload, versionId),
        req.payload.findByID({
          collection: 'lesson-bundle-versions',
          id: versionId,
          depth: 0,
          overrideAccess: true,
        }) as Promise<LessonBundleVersion>,
      ])
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
 * All in-flight `generateVersionArtifact` jobs (not completed, not in a terminal error state).
 * `payload-jobs.input` is a JSON column, so callers match specs in-memory over the (few) pending
 * rows rather than via a nested-JSON `where`. The pending set for one task slug is tiny — autoRun
 * drains it every ~3s and the prepare dedupe coalesces repeats — so a small bound comfortably
 * covers any realistic in-flight window.
 */
export async function findPendingExportJobs(payload: Payload): Promise<PayloadJob[]> {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: {
      taskSlug: { equals: GENERATE_VERSION_ARTIFACT_SLUG },
      completedAt: { exists: false },
      hasError: { not_equals: true },
    },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

/** The in-flight job matching this exact spec, or null. */
export async function findPendingExportJob(
  payload: Payload,
  input: GenerateVersionArtifactInput,
): Promise<PayloadJob | null> {
  return (await findPendingExportJobs(payload)).find((j) => jobMatchesSpec(j, input)) ?? null
}
