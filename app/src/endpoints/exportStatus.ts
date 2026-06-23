/**
 * Export status endpoint (SPEC §9) — companion to the async export endpoint. The client polls
 * this after a 202 to learn when the enqueued `generateArtifact` job has produced the artifacts,
 * then re-requests `…/export` (now warm) to download. Returns JSON, never bytes.
 *
 * `GET /api/lesson-bundles/:id/export/status?jobId=…&format=…&as=…`
 *   → { state: 'preparing' }            still generating/converting
 *   → { state: 'ready' }                artifacts cached; re-request /export to download
 *   → { state: 'error', message }       the job failed (e.g. converter down)
 *
 * SECURITY: same authorization boundary as export (shared `authorizeExportRequest` — caller
 * READ access + published-only). The job is read with overrideAccess but only AFTER that gate
 * passes AND we confirm the job belongs to this bundle, so a jobId cannot probe unrelated jobs.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isExportReady } from '../generator/exportArtifacts'
import { GENERATE_ARTIFACT_SLUG } from '../jobs/generateArtifact'
import { authorizeExportRequest } from './exportAuth'
import type { PayloadJob } from '../payload-types'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const exportStatusEndpoint: Endpoint = {
  path: '/:id/export/status',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const jobId = typeof req.query?.jobId === 'string' ? req.query.jobId : undefined
    if (!jobId) throw new APIError('Missing jobId', 400)

    const { spec } = await authorizeExportRequest(req)
    if (await isExportReady(spec)) return json({ state: 'ready' })

    // Not ready yet — consult the job to distinguish "still working" from "failed".
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

    // Bind the job to THIS bundle so a jobId can't probe unrelated jobs.
    const jobBundleId = (job?.input as { bundleId?: number | string } | undefined)?.bundleId
    const belongs =
      job?.taskSlug === GENERATE_ARTIFACT_SLUG && String(jobBundleId ?? '') === String(spec.bundleId)
    if (!job || !belongs) {
      return json({ state: 'error', message: 'Export job not found.' }, 404)
    }
    if (job.hasError) {
      return json({ state: 'error', message: 'Export failed — please try again.' }, 502)
    }
    return json({ state: 'preparing' })
  },
}
