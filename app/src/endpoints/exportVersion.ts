/**
 * Version export endpoints (SPEC §9, Official-version model) — download an immutable
 * `lesson-bundle-version`'s deliverables as one .zip, async + throttled. The version-model
 * counterpart to `exportBundle.ts`; same two-phase + GET/POST split (audit #3), but keyed on a
 * version id instead of a bundle + lockVersion.
 *
 * Mounted on the lesson-bundle-versions collection:
 *   - `GET  /api/lesson-bundle-versions/:id/export`  — serve-only (idempotent; warm → zip, cold → 409).
 *   - `GET  /api/lesson-bundle-versions/:id/export/doc?doc=<tag>` — serve ONE deliverable (teacher-first
 *     track T1): PDF inline (opens in the browser), DOCX attachment. Same warm-only contract.
 *   - `POST /api/lesson-bundle-versions/:id/export`  — prepare: warm → 200 {ready}; cold → enqueue + 202.
 *   - `GET  /api/lesson-bundle-versions/:id/export/status?jobId=…` — poll an enqueued job.
 * Query (export): `?as=docx|pdf` (default `docx`).
 *
 * No published gate and no lockVersion drift: a version is immutable, so its cache scope never
 * changes — the bundle path's "bundle changed during export" race cannot occur here.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { json } from './respond'
import {
  isExportReady,
  loadCachedDeliverable,
  loadCachedExportZip,
  mimeFor,
  safePrefix,
} from '../generator/exportArtifacts'
import {
  GENERATE_VERSION_ARTIFACT_SLUG,
  findPendingExportJob,
  jobMatchesVersion,
  type GenerateVersionArtifactInput,
} from '../jobs/generateVersionArtifact'
import { authorizeVersionExportRequest } from './exportAuth'
import { parseDeliverableTag } from './parseFormat'
import { enforceUserRateLimit } from '../lib/rateLimit'
import type { PayloadJob } from '../payload-types'

/** GET — serve-only download. Idempotent, side-effect free; never enqueues. */
export const exportVersionEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const { version, spec } = await authorizeVersionExportRequest(req)
    const { kind } = spec

    const cached = await loadCachedExportZip(spec)
    if (!cached) {
      return json({ state: 'not_prepared', message: 'Export not ready — prepare it first.' }, 409)
    }

    const prefix = safePrefix(version.meta?.filePrefix)
    return new Response(new Uint8Array(cached), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${prefix}_${kind}.zip"`,
        'Content-Length': String(cached.length),
      },
    })
  },
}

/**
 * GET /:id/export/doc — serve ONE deliverable (teacher-first track T1, DECISIONS 2026-07-08).
 * Serve-only like the zip GET (never generates; cold → 409, the client prepares via the same POST).
 * PDF is `Content-Disposition: inline` so it opens in a browser tab — the whole point of the
 * per-document button; DOCX stays `attachment`. 404 when the export is ready but this version has
 * no such document (not every sub-strand has a Final Explanation / Summary Table).
 */
export const exportVersionDocEndpoint: Endpoint = {
  path: '/:id/export/doc',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const { spec } = await authorizeVersionExportRequest(req)
    const tag = parseDeliverableTag(req)

    const doc = await loadCachedDeliverable(spec, tag)
    if (doc.state === 'cold') {
      return json({ state: 'not_prepared', message: 'Export not ready — prepare it first.' }, 409)
    }
    if (doc.state === 'absent') {
      throw new APIError('This lesson plan has no such document.', 404)
    }

    // A zero-copy view over the cached Buffer (the copying Uint8Array(buffer) constructor would
    // memcpy the whole deliverable on every download of this teacher-facing hot path).
    const body = new Uint8Array(doc.bytes.buffer, doc.bytes.byteOffset, doc.bytes.byteLength)
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': mimeFor(spec.kind),
        'Content-Disposition': `${spec.kind === 'pdf' ? 'inline' : 'attachment'}; filename="${doc.filename}"`,
        'Content-Length': String(doc.bytes.length),
      },
    })
  },
}

/** POST — prepare. The only state-changing export op (CSRF-guarded by the SameSite=Lax cookie). */
export const exportVersionPrepareEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const limited = await enforceUserRateLimit(req, 'export')
    if (limited) return limited

    const { version, spec } = await authorizeVersionExportRequest(req)
    const { kind } = spec

    if (await isExportReady(spec)) {
      return json({ state: 'ready' })
    }

    const input: GenerateVersionArtifactInput = { versionId: Number(version.id), kind }

    // Dedupe: coalesce onto an already in-flight job for the SAME {versionId, kind} rather than
    // enqueuing a duplicate (repeated clicks / poll races / two tabs). The artifact cache already makes
    // COMPLETED repeats free (the isExportReady short-circuit above); this guards the in-flight window.
    const existing = await findPendingExportJob(req.payload, input)
    const job = existing ?? (await req.payload.jobs.queue({ task: GENERATE_VERSION_ARTIFACT_SLUG, input, req }))

    const statusUrl = `/api/lesson-bundle-versions/${version.id}/export/status?jobId=${job.id}&as=${kind}`
    return json({ state: 'preparing', jobId: job.id, statusUrl, retryAfterMs: 1500 }, 202)
  },
}

/** GET status — poll the enqueued generateVersionArtifact job. Returns JSON, never bytes. */
export const exportVersionStatusEndpoint: Endpoint = {
  path: '/:id/export/status',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const jobId = typeof req.query?.jobId === 'string' ? req.query.jobId : undefined
    if (!jobId) throw new APIError('Missing jobId', 400)

    const { version, spec } = await authorizeVersionExportRequest(req)

    // CONTRACT (Phase-5 residual / Codex #4, resolved 2026-06-28): readiness here is VERSION/SPEC-scoped,
    // not job-scoped — and deliberately so. A cache hit returns {ready} regardless of the supplied jobId
    // because (a) the caller already holds version READ (authorizeVersionExportRequest above) and (b)
    // completed payload-jobs rows are pruned, so a genuinely-ready artifact MUST resolve even when its
    // job row is gone. (Binding the jobId before this short-circuit was tried and reverted: it 404s the
    // normal poll the instant a fast job completes + is pruned.) The jobId still binds the NOT-ready
    // diagnostics to THIS version below, so a stray jobId 404s exactly when it matters — when there is
    // no cached artifact to report.
    if (await isExportReady(spec)) return json({ state: 'ready' })

    // Not ready → the jobId must name a real generateVersionArtifact job for THIS version (no probing
    // another version's job), else 404.
    let job: PayloadJob | null = null
    try {
      job = await req.payload.findByID({
        collection: 'payload-jobs',
        id: jobId,
        depth: 0,
        overrideAccess: true,
      })
    } catch {
      job = null
    }
    if (!job || !jobMatchesVersion(job, version.id)) {
      return json({ state: 'error', message: 'Export job not found.' }, 404)
    }
    if (job.hasError) {
      return json({ state: 'error', message: 'Export failed — please try again.' }, 502)
    }
    // Finished without error but artifacts absent (e.g. evicted post-completion): not recoverable
    // by polling. (No lockVersion drift case — a version is immutable.)
    if (job.completedAt) {
      return json({ state: 'error', message: 'Export expired — please retry.' }, 409)
    }
    return json({ state: 'preparing' })
  },
}
