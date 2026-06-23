/**
 * Export endpoint (SPEC §9) — download a bundle's deliverables as one .zip, async + throttled.
 *
 * Mounted on the lesson-bundles collection → `GET /api/lesson-bundles/:id/export`.
 * Query: `?format=standard|compact` (default `standard`) · `?as=docx|pdf` (default `docx`).
 *
 * TWO-PHASE (readiness #1): heavy generation/conversion must never tie up an app worker.
 *   - WARM (artifacts already cached) → 200 with the .zip, synchronously (a pure cache read).
 *   - COLD (cache miss) → enqueue the `generateArtifact` job and return **202** with a status
 *     URL. The in-process queue runner produces the artifacts (bounded by the queue's
 *     concurrency `limit`); the client polls the status URL, then re-requests this endpoint —
 *     now warm — to download. So this handler does at most a cache read + an enqueue: O(ms).
 *
 * SECURITY: this is the authorization boundary that the generator/job deliberately are NOT.
 * We re-read the bundle with the caller's OWN access (`findReadableBundle`, overrideAccess:false)
 * so read rules apply (a Teacher only matches published bundles), then assert published-only,
 * BEFORE serving or enqueuing. The job runs as a trusted system path on already-gated input.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { assertExportable, NotExportableError } from '../generator/generateForBundle'
import { loadCachedExportZip, type ArtifactSpec } from '../generator/exportArtifacts'
import { GENERATE_ARTIFACT_SLUG, type GenerateArtifactInput } from '../jobs/generateArtifact'
import { parseLessonSequenceFormat, parseExportKind } from './parseFormat'
import { findReadableBundle } from '../lib/readBundle'
import { enforceUserRateLimit } from '../lib/rateLimit'
import type { User } from '../payload-types'

export const exportBundleEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    // Throttle per user BEFORE any work (readiness #1). A warm hit is cheap, but cold hits
    // enqueue real work, so the rate limit guards the enqueue rate regardless of warmth.
    const limited = enforceUserRateLimit(req, 'export')
    if (limited) return limited

    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing bundle id', 400)

    const format = parseLessonSequenceFormat(req)
    const kind = parseExportKind(req)

    // Authorization: enforce the caller's READ access, then published-only, before serving.
    const bundle = await findReadableBundle(req.payload, { id, user: req.user as User, req })
    if (!bundle) throw new APIError('Bundle not found', 404)
    try {
      assertExportable(bundle)
    } catch (err) {
      if (err instanceof NotExportableError) throw new APIError(err.message, 409)
      throw err
    }

    const spec: ArtifactSpec = { bundleId: id, lockVersion: bundle.lockVersion, format, kind }

    // WARM: serve the cached zip synchronously.
    const cached = await loadCachedExportZip(spec)
    if (cached) {
      const prefix = (bundle.meta?.filePrefix || 'bundle').replace(/[^A-Za-z0-9._-]/g, '_')
      return new Response(new Uint8Array(cached), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${prefix}_${format}_${kind}.zip"`,
          'Content-Length': String(cached.length),
        },
      })
    }

    // COLD: enqueue the heavy work and return 202 + a poll URL. (TypedJobs only knows the task
    // slug after `generate:types` runs on the Rock; the input is validated by the task schema.)
    const input: GenerateArtifactInput = {
      bundleId: Number(id),
      lockVersion: Number(bundle.lockVersion ?? 0),
      format,
      kind,
    }
    const job = (await req.payload.jobs.queue({
      task: GENERATE_ARTIFACT_SLUG,
      input,
      req,
    } as Parameters<typeof req.payload.jobs.queue>[0])) as { id: string | number }

    const statusUrl = `/api/lesson-bundles/${id}/export/status?jobId=${job.id}&format=${format}&as=${kind}`
    return new Response(
      JSON.stringify({ status: 'preparing', jobId: job.id, statusUrl, retryAfterMs: 1500 }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    )
  },
}
