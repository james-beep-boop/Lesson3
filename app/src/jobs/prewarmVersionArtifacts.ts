/**
 * Artifact pre-warming (teacher-first track T1, DECISIONS 2026-07-08) — enqueue
 * `generateVersionArtifact` for BOTH kinds the moment a version becomes Official, so teachers
 * hit a warm cache instead of the cold 202/poll path. Two callers: the lesson-plans
 * `afterChange` hook (`prewarmOfficialArtifacts` — every AUTHENTICATED pointer move: make-official,
 * the admin repair form, any future path) and first-ingest (a trusted system path with no
 * `req.user`, so it opts in explicitly).
 *
 * TRUST: called from already-authorized admin/system paths. Deliberately NOT rate-limited — it is
 * not a caller-driven surface.
 *
 * ENQUEUES OUTSIDE THE CALLER'S TRANSACTION via `enqueueDetached` (L3-03) — warming is side work and
 * must never be able to undo the pointer move or ingest it follows. Mechanism and the orphan trade
 * live in `lib/enqueue.ts`; the local consequence is noted at the call below.
 */

import { enqueueDetached } from '../lib/enqueue'
import { isExportReady, versionScope } from '../generator/exportArtifacts'
import {
  GENERATE_VERSION_ARTIFACT_SLUG,
  findPendingExportJob,
  isPendingExportJobConflict,
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
    // The fs readiness checks and exact pending-job reads are independent — overlap them.
    const [ready, pending] = await Promise.all([
      Promise.all(KINDS.map((kind) => isExportReady({ scope: versionScope(versionId), kind }))),
      Promise.all(
        KINDS.map((kind) =>
          findPendingExportJob(req.payload, { versionId, kind }),
        ),
      ),
    ])
    // ORPHAN CASE (the primary write rolls back after we enqueue) is tolerable here: a missing
    // pre-warm just means the teacher takes the normal cold 202/poll path. The artifact job
    // findByID's the version and, since 2026-07-21, treats "gone" as a logged NO-OP rather than a
    // failure — no error-tracker capture, no failed job row for a benign outcome (same call
    // `messagePing` makes when its message vanished).
    //
    // Concurrent, not sequential: before L3-03 these inserts shared the caller's transaction
    // connection and HAD to serialise. `enqueueDetached` gives each its own, so the round trips
    // overlap — two per version, and this runs once per file across a 42-file ingest.
    const wanted = KINDS.map((kind) => ({ kind, input: { versionId, kind } as GenerateVersionArtifactInput }))
      .filter(({ kind }) => !ready[KINDS.indexOf(kind)])
      .filter(({ kind }) => !pending[KINDS.indexOf(kind)])
    await Promise.all(
      wanted.map(async ({ input }) => {
        try {
          await enqueueDetached(req.payload, { task: GENERATE_VERSION_ARTIFACT_SLUG, input })
        } catch (error) {
          // Another promotion/request won the exact same pending-job insert. The database invariant
          // has already achieved the desired state, so this is a successful coalesce, not an alert.
          if (!isPendingExportJobConflict(error)) throw error
        }
      }),
    )
  } catch (err) {
    req.payload.logger.error({ err, versionId }, 'prewarmVersionArtifacts enqueue failed')
    captureException(err, { job: 'prewarmVersionArtifacts', versionId })
  }
}
