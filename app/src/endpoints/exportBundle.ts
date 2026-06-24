/**
 * Export endpoints (SPEC §9) — download a bundle's deliverables as one .zip, async + throttled.
 *
 * Mounted on the lesson-bundles collection:
 *   - `GET  /api/lesson-bundles/:id/export`  — serve-only download (idempotent, side-effect free).
 *   - `POST /api/lesson-bundles/:id/export`  — prepare: enqueue the generateArtifact job if cold.
 * Query (both): `?format=standard|compact` (default `standard`) · `?as=docx|pdf` (default `docx`).
 *
 * WHY THE SPLIT (audit #3 — CSRF / idempotency): a single GET that *enqueued* on a cache miss was
 * both non-idempotent and a cross-site enqueue vector — a bare `<img src=…/export>` would queue
 * heavy work. So the ONLY state-changing operation (enqueue) now lives on POST. With the Payload
 * auth cookie set SameSite=Lax, a cross-site POST carries no cookie → `req.user` is null → 401,
 * so an attacker cannot drive the queue. GET is now a pure cache read: warm → the .zip, cold →
 * 409 telling the client to POST first. It never enqueues.
 *
 * TWO-PHASE (readiness #1): heavy generation/conversion must never tie up an app worker.
 *   - POST, artifacts already cached → 200 `{ state: 'ready' }`; client GETs to download.
 *   - POST, cache miss → enqueue `generateArtifact` + 202 `{ statusUrl }`; client polls then GETs.
 * So POST does at most a cache check + an enqueue, and GET does at most a cache read: O(ms).
 *
 * SECURITY: the authorization boundary (caller READ access + published-only) lives in the
 * shared `authorizeExportRequest`; the generator/job deliberately do NOT re-check (trusted
 * system path on already-gated input).
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isExportReady, loadCachedExportZip, safePrefix } from '../generator/exportArtifacts'
import { GENERATE_ARTIFACT_SLUG, type GenerateArtifactInput } from '../jobs/generateArtifact'
import { authorizeExportRequest } from './exportAuth'
import { enforceUserRateLimit } from '../lib/rateLimit'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * GET — serve-only download. Idempotent and side-effect free: it serves the cached .zip when
 * warm and otherwise tells the client to prepare (POST) first. It NEVER enqueues, so a cross-site
 * GET cannot drive the queue and a repeated GET is harmless.
 */
export const exportBundleEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const { bundle, spec } = await authorizeExportRequest(req)
    const { format, kind } = spec

    const cached = await loadCachedExportZip(spec)
    if (!cached) {
      // Cold: do NOT enqueue here (that's POST's job). Ask the client to prepare first.
      return json({ state: 'not_prepared', message: 'Export not ready — prepare it first.' }, 409)
    }

    const prefix = safePrefix(bundle.meta?.filePrefix)
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

/**
 * POST — prepare. The only state-changing export operation, hence the only one that needs CSRF
 * protection (provided by the SameSite=Lax auth cookie). Warm → `{ state: 'ready' }` so the client
 * can GET straight away; cold → enqueue the heavy job and return 202 + a poll URL.
 */
export const exportPrepareEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    // Throttle per user BEFORE any work (readiness #1): this is where cold hits enqueue real work.
    const limited = enforceUserRateLimit(req, 'export')
    if (limited) return limited

    const { bundle, spec } = await authorizeExportRequest(req)
    const { format, kind } = spec

    // WARM: artifacts already cached — tell the client to download (GET) immediately. A presence
    // check (not a full byte load) — the bytes are served by GET.
    if (await isExportReady(spec)) {
      return json({ state: 'ready' })
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
    return json({ state: 'preparing', jobId: job.id, statusUrl, retryAfterMs: 1500 }, 202)
  },
}
