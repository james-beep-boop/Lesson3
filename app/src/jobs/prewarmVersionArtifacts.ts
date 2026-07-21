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
 * ENQUEUES OUTSIDE THE CALLER'S TRANSACTION (L3-03, 2026-07-21). `req` is deliberately NOT passed to
 * `jobs.queue`. It used to be, and the job rows then rode the promotion's transaction — which meant a
 * failed job INSERT aborted that transaction, and because the failure was caught and swallowed, the
 * commit degraded into a silent rollback: the promotion reported success and persisted nothing.
 * Warming is side work and must never be able to undo the pointer move it follows. The cost is that
 * a job is no longer atomic with the promotion and can be orphaned by a later rollback; that is
 * harmless here, because a missing prewarm just means the next reader takes the cold path.
 */

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
      // `req` DELIBERATELY OMITTED (L3-03, 2026-07-21): passing it enlisted this insert in the
      // caller's transaction — ingest or make-official — so a failed enqueue aborted that
      // transaction, and the swallow below turned a rolled-back ingest into a reported success.
      // (Installed drizzle `commitTransaction` is `try { resolve() } catch { reject() }` — a failed
      // commit rolls back without rethrowing.) A pre-warm is a pure optimisation; it must never be
      // able to lose the content write it rides on. Enqueued on its own connection, it cannot.
      //
      // Orphan case (primary write rolls back after we enqueue) is harmless here: the artifact job
      // findByID's the version and fails cleanly if it is gone, and a missing pre-warm just means
      // the teacher takes the normal cold 202/poll path.
      await req.payload.jobs.queue({
        task: GENERATE_VERSION_ARTIFACT_SLUG,
        input,
      })
    }
  } catch (err) {
    req.payload.logger.error({ err, versionId }, 'prewarmVersionArtifacts enqueue failed')
    captureException(err, { job: 'prewarmVersionArtifacts', versionId })
  }
}
