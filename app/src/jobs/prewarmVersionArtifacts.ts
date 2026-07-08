/**
 * Artifact pre-warming (teacher-first track T1, DECISIONS 2026-07-08) — enqueue
 * `generateVersionArtifact` for BOTH kinds the moment a version becomes Official
 * (make-official + first-ingest), so teachers hit a warm cache instead of the cold
 * 202/poll path. Also the single owner of the "is there already an in-flight export
 * job for this spec?" lookup the export endpoints share (dedupe + status binding).
 *
 * TRUST: called from already-authorized admin/system paths (make-official is Subject/Site-Admin
 * gated; ingest is Site-Admin CLI/upload). Deliberately NOT rate-limited — it is not a
 * caller-driven surface. Runs inside the caller's transaction (`req`), so the queued job rows
 * commit or roll back atomically with the promotion itself.
 */
import type { Payload, PayloadRequest } from 'payload'

import { isExportReady, versionScope, type ArtifactSpec, type ExportKind } from '../generator/exportArtifacts'
import {
  GENERATE_VERSION_ARTIFACT_SLUG,
  type GenerateVersionArtifactInput,
} from './generateVersionArtifact'
import { captureException } from '../lib/errorTracking'
import type { PayloadJob } from '../payload-types'

/** The minimal request shape shared by HTTP handlers (full `PayloadRequest`) and the ingest system
 *  path (a partial req carrying `payload` + `transactionID`). */
export type IngestCapableReq = Partial<PayloadRequest> & { payload: Payload }

/**
 * Is `job` a `generateVersionArtifact` job for `versionId`? `payload-jobs.input` is a JSON column, so
 * read `versionId` off it as a scalar (not a Payload relationship — `relId`/`toId` don't apply). Shared
 * by the status-binding check, the dedupe lookup, and pre-warm.
 */
export function jobMatchesVersion(job: PayloadJob | null | undefined, versionId: number | string): boolean {
  const input = job?.input as { versionId?: number | string } | undefined
  return (
    job?.taskSlug === GENERATE_VERSION_ARTIFACT_SLUG &&
    String(input?.versionId ?? '') === String(versionId)
  )
}

/**
 * Find an in-flight `generateVersionArtifact` job matching this exact spec, or null. A job is
 * "in-flight" if it has not completed and is not in a terminal error state. `payload-jobs.input` is a
 * JSON column, so match in-memory over the (few) pending rows rather than via a nested-JSON `where`.
 */
export async function findPendingExportJob(
  req: IngestCapableReq,
  input: GenerateVersionArtifactInput,
): Promise<PayloadJob | null> {
  const { docs } = await req.payload.find({
    collection: 'payload-jobs',
    where: {
      taskSlug: { equals: GENERATE_VERSION_ARTIFACT_SLUG },
      completedAt: { exists: false },
      hasError: { not_equals: true },
    },
    // The pending set for one task slug is tiny — autoRun drains it every ~3s and dedupe coalesces
    // repeats — so a small bound comfortably covers any realistic in-flight window.
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  const match = docs.find((j) => {
    const i = j.input as { kind?: string } | undefined
    return jobMatchesVersion(j, input.versionId) && i?.kind === input.kind
  })
  return match ?? null
}

/**
 * Enqueue docx+pdf generation for `versionId` unless each is already cached or in flight.
 * NEVER throws — a pre-warm failure must not fail the promotion/ingest it rides on (the
 * messagePing enqueue precedent): teachers just fall back to the cold 202/poll path.
 */
export async function prewarmVersionArtifacts(req: IngestCapableReq, versionId: number): Promise<void> {
  for (const kind of ['docx', 'pdf'] as const satisfies readonly ExportKind[]) {
    try {
      const spec: ArtifactSpec = { scope: versionScope(versionId), kind }
      if (await isExportReady(spec)) continue
      const input: GenerateVersionArtifactInput = { versionId, kind }
      if (await findPendingExportJob(req, input)) continue
      await req.payload.jobs.queue({ task: GENERATE_VERSION_ARTIFACT_SLUG, input, req: req as PayloadRequest })
    } catch (err) {
      req.payload.logger.error({ err, versionId, kind }, 'prewarmVersionArtifacts enqueue failed')
      captureException(err, { job: 'prewarmVersionArtifacts', versionId, kind })
    }
  }
}
