/**
 * Version export endpoints (SPEC §9, Official-version model) — download an immutable
 * `lesson-bundle-version`'s deliverables as one .zip, async + throttled. The version-model
 * counterpart to `exportBundle.ts`; same two-phase + GET/POST split (audit #3), but keyed on a
 * version id instead of a bundle + lockVersion.
 *
 * Mounted on the lesson-bundle-versions collection:
 *   - `GET  /api/lesson-bundle-versions/:id/export`  — serve-only (idempotent; warm → zip, cold → 409).
 *   - `POST /api/lesson-bundle-versions/:id/export`  — prepare: warm → 200 {ready}; cold → enqueue + 202.
 *   - `GET  /api/lesson-bundle-versions/:id/export/status?jobId=…` — poll an enqueued job.
 * Query (export): `?format=standard|compact` (default `standard`) · `?as=docx|pdf` (default `docx`).
 *
 * No published gate and no lockVersion drift: a version is immutable, so its cache scope never
 * changes — the bundle path's "bundle changed during export" race cannot occur here.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isExportReady, loadCachedExportZip, safePrefix } from '../generator/exportArtifacts'
import {
  GENERATE_VERSION_ARTIFACT_SLUG,
  type GenerateVersionArtifactInput,
} from '../jobs/generateVersionArtifact'
import { authorizeVersionExportRequest } from './exportAuth'
import { enforceUserRateLimit } from '../lib/rateLimit'
import type { PayloadJob } from '../payload-types'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** GET — serve-only download. Idempotent, side-effect free; never enqueues. */
export const exportVersionEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const { version, spec } = await authorizeVersionExportRequest(req)
    const { format, kind } = spec

    const cached = await loadCachedExportZip(spec)
    if (!cached) {
      return json({ state: 'not_prepared', message: 'Export not ready — prepare it first.' }, 409)
    }

    const prefix = safePrefix(version.meta?.filePrefix)
    return new Response(new Uint8Array(cached), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${prefix}_${format}_${kind}.zip"`,
        'Content-Length': String(cached.length),
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

    const limited = enforceUserRateLimit(req, 'export')
    if (limited) return limited

    const { version, spec } = await authorizeVersionExportRequest(req)
    const { format, kind } = spec

    if (await isExportReady(spec)) {
      return json({ state: 'ready' })
    }

    const input: GenerateVersionArtifactInput = { versionId: Number(version.id), format, kind }
    // The slug isn't in the generated TypedJobs map until `generate:types` runs on the Rock (same
    // pre-generation typing gap as generateArtifact); coerce the args shape until it is.
    const job = await req.payload.jobs.queue({ task: GENERATE_VERSION_ARTIFACT_SLUG, input, req } as unknown as Parameters<
      typeof req.payload.jobs.queue
    >[0])

    const statusUrl = `/api/lesson-bundle-versions/${version.id}/export/status?jobId=${job.id}&format=${format}&as=${kind}`
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
    if (await isExportReady(spec)) return json({ state: 'ready' })

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

    // Bind the job to THIS version so a jobId can't probe unrelated jobs.
    const jobInput = job?.input as { versionId?: number | string } | undefined
    const belongs =
      String(job?.taskSlug ?? '') === GENERATE_VERSION_ARTIFACT_SLUG &&
      String(jobInput?.versionId ?? '') === String(version.id)
    if (!job || !belongs) {
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
