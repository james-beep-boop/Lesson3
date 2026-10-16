/**
 * ARES-format JSON export endpoint.
 *
 * Mounted on lesson-bundle-versions: GET /api/lesson-bundle-versions/:id/ares-export
 *
 * Returns the version in the ARES interchange format (the same shape the upload endpoint accepts),
 * so a file downloaded here can be handed straight to POST /api/lesson-plans/upload or
 * scripts/ingest.ts at another school. The conversion is the same `bundleToAresData` the DOCX
 * generator uses — it is already proven to round-trip correctly.
 *
 * Access gate: caller must have READ access to the version (same rule as the DOCX export).
 * No Site-Admin restriction — any teacher who can view a lesson can share it.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { findReadableVersion } from '../lib/readBundle'
import { bundleToAresData } from '../generator/adapter'
import { safePrefix } from '../generator/exportArtifacts'
import type { User } from '../payload-types'

export const aresExportEndpoint: Endpoint = {
  path: '/:id/ares-export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing version id', 400)

    const version = await findReadableVersion(req.payload, { id, user: req.user as User, req })
    if (!version) throw new APIError('Version not found', 404)

    // bundleToAresData coerces absent groups for the DOCX generator: UNIT becomes {},
    // and absent FINAL_EXPLANATION / SUMMARY_TABLE become undefined (dropped by JSON.stringify).
    // For interchange we need every required key present and absent optional groups as explicit
    // null so the ingest parser's key-presence check (`k in result`) passes.
    const raw = bundleToAresData(version)
    const aresData = {
      schemaVersion: '1.0.0',
      META: raw.META,
      UNIT: version.unit != null ? raw.UNIT : null,
      LESSONS: raw.LESSONS,
      FINAL_EXPLANATION: raw.FINAL_EXPLANATION ?? null,
      SUMMARY_TABLE: raw.SUMMARY_TABLE ?? null,
    }
    const body = JSON.stringify(aresData, null, 2)
    const prefix = safePrefix(version.meta?.filePrefix)
    const filename = `${prefix}.json`

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  },
}
