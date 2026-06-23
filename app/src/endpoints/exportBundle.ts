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
 * SECURITY: the authorization boundary (caller READ access + published-only) lives in the
 * shared `authorizeExportRequest`; the generator/job deliberately do NOT re-check (trusted
 * system path on already-gated input).
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { loadCachedExportZip, safePrefix } from '../generator/exportArtifacts'
import { GENERATE_ARTIFACT_SLUG, type GenerateArtifactInput } from '../jobs/generateArtifact'
import { authorizeExportRequest } from './exportAuth'
import { enforceUserRateLimit } from '../lib/rateLimit'

export const exportBundleEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    // Throttle per user BEFORE any work (readiness #1). A warm hit is cheap, but cold hits
    // enqueue real work, so the rate limit guards the enqueue rate regardless of warmth.
    const limited = enforceUserRateLimit(req, 'export')
    if (limited) return limited

    const { bundle, spec } = await authorizeExportRequest(req)
    const { format, kind } = spec

    // WARM: serve the cached zip synchronously.
    const cached = await loadCachedExportZip(spec)
    if (cached) {
      const prefix = safePrefix(bundle.meta?.filePrefix)
      return new Response(new Uint8Array(cached), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${prefix}_${format}_${kind}.zip"`,
          'Content-Length': String(cached.length),
        },
      })
    }

    // COLD: enqueue the heavy work and return 202 + a poll URL.
    const input: GenerateArtifactInput = {
      bundleId: Number(spec.bundleId),
      lockVersion: Number(bundle.lockVersion ?? 0),
      format,
      kind,
    }
    const job = await req.payload.jobs.queue({ task: GENERATE_ARTIFACT_SLUG, input, req })

    const statusUrl = `/api/lesson-bundles/${spec.bundleId}/export/status?jobId=${job.id}&format=${format}&as=${kind}`
    return new Response(
      JSON.stringify({ status: 'preparing', jobId: job.id, statusUrl, retryAfterMs: 1500 }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    )
  },
}
