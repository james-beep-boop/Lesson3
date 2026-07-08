/**
 * Artifact pre-warming (teacher-first track T1, DECISIONS 2026-07-08) — enqueue
 * `generateVersionArtifact` for BOTH kinds the moment a version becomes Official, so teachers
 * hit a warm cache instead of the cold 202/poll path. Two callers: the lesson-plans
 * `afterChange` hook (`prewarmOfficialArtifacts` — every AUTHENTICATED pointer move: make-official,
 * the admin repair form, any future path) and first-ingest (a trusted system path with no
 * `req.user`, so it opts in explicitly).
 *
 * TRUST: called from already-authorized admin/system paths. Deliberately NOT rate-limited — it is
 * not a caller-driven surface. Runs inside the caller's transaction (`req`), so the queued job rows
 * commit or roll back atomically with the promotion itself.
 */
import type { PayloadRequest } from 'payload'

import { isExportReady, versionScope } from '../generator/exportArtifacts'
import {
  GENERATE_VERSION_ARTIFACT_SLUG,
  findPendingExportJobs,
  jobMatchesSpec,
  type GenerateVersionArtifactInput,
} from './generateVersionArtifact'
import { captureException } from '../lib/errorTracking'
import type { IngestReq } from '../ingest/index'

const KINDS = ['docx', 'pdf'] as const

/**
 * Enqueue docx+pdf generation for `versionId` unless each is already cached or in flight.
 * NEVER throws — a pre-warm failure must not fail the promotion/ingest it rides on (the
 * messagePing enqueue precedent): teachers just fall back to the cold 202/poll path.
 * Accepts ingest's partial req (type-only import — no runtime dependency on the ingest module).
 */
export async function prewarmVersionArtifacts(req: IngestReq, versionId: number): Promise<void> {
  try {
    // The fs readiness checks and the single pending-jobs read are independent — overlap them.
    const [ready, pending] = await Promise.all([
      Promise.all(KINDS.map((kind) => isExportReady({ scope: versionScope(versionId), kind }))),
      findPendingExportJobs(req.payload),
    ])
    for (const [i, kind] of KINDS.entries()) {
      if (ready[i]) continue
      const input: GenerateVersionArtifactInput = { versionId, kind }
      if (pending.some((j) => jobMatchesSpec(j, input))) continue
      // Sequential on purpose: the queue inserts share the caller's transaction connection.
      await req.payload.jobs.queue({
        task: GENERATE_VERSION_ARTIFACT_SLUG,
        input,
        req: req as PayloadRequest,
      })
    }
  } catch (err) {
    req.payload.logger.error({ err, versionId }, 'prewarmVersionArtifacts enqueue failed')
    captureException(err, { job: 'prewarmVersionArtifacts', versionId })
  }
}
