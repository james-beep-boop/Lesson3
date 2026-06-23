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
 * SECURITY: same authorization boundary as export — re-read with the caller's READ access and
 * assert published-only before reporting anything. The job is read with overrideAccess but only
 * AFTER we confirm the caller can read the bundle AND that the job belongs to this bundle, so a
 * jobId cannot be used to probe unrelated jobs.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { assertExportable, NotExportableError } from '../generator/generateForBundle'
import { isExportReady, type ArtifactSpec } from '../generator/exportArtifacts'
import { GENERATE_ARTIFACT_SLUG } from '../jobs/generateArtifact'
import { parseLessonSequenceFormat, parseExportKind } from './parseFormat'
import { findReadableBundle } from '../lib/readBundle'
import type { User } from '../payload-types'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const exportStatusEndpoint: Endpoint = {
  path: '/:id/export/status',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing bundle id', 400)
    const jobId = typeof req.query?.jobId === 'string' ? req.query.jobId : undefined
    if (!jobId) throw new APIError('Missing jobId', 400)

    const format = parseLessonSequenceFormat(req)
    const kind = parseExportKind(req)

    // Authorization: caller's READ access + published-only, exactly like the export endpoint.
    const bundle = await findReadableBundle(req.payload, { id, user: req.user as User, req })
    if (!bundle) throw new APIError('Bundle not found', 404)
    try {
      assertExportable(bundle)
    } catch (err) {
      if (err instanceof NotExportableError) throw new APIError(err.message, 409)
      throw err
    }

    const spec: ArtifactSpec = { bundleId: id, lockVersion: bundle.lockVersion, format, kind }
    if (await isExportReady(spec)) return json({ state: 'ready' })

    // Not ready yet — consult the job to distinguish "still working" from "failed".
    let job: JobRow | null = null
    try {
      // `payload-jobs` is a Payload-managed collection; its slug only enters the generated
      // Config type after `generate:types` runs on the Rock, so widen the slug for local tsc.
      type CollectionSlug = Parameters<typeof req.payload.findByID>[0]['collection']
      job = (await req.payload.findByID({
        collection: 'payload-jobs' as CollectionSlug,
        id: jobId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as JobRow
    } catch {
      job = null
    }

    // Bind the job to THIS bundle so a jobId can't probe unrelated jobs.
    const jobBundleId = (job?.input as { bundleId?: number | string } | undefined)?.bundleId
    const belongs =
      job?.taskSlug === GENERATE_ARTIFACT_SLUG && String(jobBundleId ?? '') === String(id)
    if (!job || !belongs) {
      return json({ state: 'error', message: 'Export job not found.' }, 404)
    }
    if (job.hasError) {
      return json({ state: 'error', message: 'Export failed — please try again.' }, 502)
    }
    return json({ state: 'preparing' })
  },
}

interface JobRow {
  hasError?: boolean | null
  taskSlug?: string | null
  input?: unknown
}
