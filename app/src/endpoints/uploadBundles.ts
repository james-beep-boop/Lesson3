/**
 * Site-Admin lesson-plan UPLOAD endpoint (SPEC §7 deviation — see docs/DECISIONS.md 2026-06-13).
 *
 * Mounted on lesson-plans → `POST /api/lesson-plans/upload` (multipart, field `files`).
 * Accepts ARES `.json` exports and ZIP archives of JSON, parses each with the SAFE `extractAresJson` (JSON.parse +
 * structural guards — never executes input), and creates Official 1.0.0 lesson-plan versions
 * via the shared upload/import core.
 *
 * SECURITY — this is the authorization boundary that makes a web ingest surface acceptable:
 *  - **Site Administrator only**, enforced HERE server-side (`isSiteAdmin`) — the hidden UI
 *    button is convenience, not the gate.
 *  - **JSON data only, parse-never-execute.** No `.js` over the web (that stays the dev CLI); the
 *    `.js` RCE concern that kept ingest off HTTP (SPEC §7) does not apply to JSON.parse.
 *  - **Size/count caps** bound the request; the same validate + taxonomy gates as the CLI run
 *    in pre-flight; invalid files are rejected and valid files are committed together.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isSiteAdmin } from '../access'
import { enforceUserRateLimit } from '../lib/rateLimit'
import { ingestUploadItems } from '../ingest'
import { IngestError } from '../ingest/errors'
import { MAX_BODY_BYTES, MAX_FILES, prepareUploadFiles } from '../ingest/uploadFiles'
import type { User } from '../payload-types'
import { assertDeclaredBodyWithin } from './respond'

export const uploadBundlesEndpoint: Endpoint = {
  path: '/upload',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    if (!isSiteAdmin(req.user as User)) {
      throw new APIError('Forbidden — Site administrator only', 403)
    }

    // ⚑ AFTER the authorization checks, deliberately. Rate limiting first would let an unauthenticated
    // or non-admin caller spend a real administrator's budget — a denial-of-service handed to exactly
    // the people the two lines above exist to turn away. Authorize, then meter.
    //
    // Returns a ready-made 429 with `Retry-After` rather than throwing, which is this helper's contract
    // (`enforceUserRateLimit`); the surrounding handler signals its own failures with `APIError`.
    //
    // ⚑ Fails CLOSED on a database error, and that is acceptable here rather than merely tolerated:
    // `take()` does not catch, so a failed counter write surfaces as a 500 — but every subsequent step
    // of this handler needs the same database, so a DB outage fails the upload either way. The only
    // change is that it now fails before the body is buffered instead of after.
    const limited = await enforceUserRateLimit(req, 'upload')
    if (limited) return limited

    // Coarse pre-parse guard: reject an oversized body via Content-Length BEFORE `formData()` buffers
    // the whole multipart payload into memory. The header may be absent or wrong, so the per-file caps
    // below stay the authority; this just bounds the buffering for an honest (or huge-and-honest) client.
    assertDeclaredBodyWithin(req, MAX_BODY_BYTES, `Upload too large (max ${MAX_BODY_BYTES} bytes)`)

    let form: FormData
    try {
      form = await req.formData!()
    } catch {
      throw new APIError('Expected a multipart/form-data upload with a "files" field', 400)
    }

    const files = form.getAll('files').filter((f): f is File => typeof f !== 'string')
    if (files.length === 0) throw new APIError('No files uploaded (field name: "files")', 400)
    if (files.length > MAX_FILES) throw new APIError(`Too many files (max ${MAX_FILES})`, 400)

    if (files.reduce((bytes, file) => bytes + file.size, 0) > MAX_BODY_BYTES) {
      throw new APIError(`Upload too large (max ${MAX_BODY_BYTES} bytes)`, 400)
    }

    let inputs: Awaited<ReturnType<typeof prepareUploadFiles>>
    try {
      inputs = await prepareUploadFiles(files)
    } catch (e) {
      if (e instanceof IngestError) throw new APIError(e.message, 400)
      throw e
    }

    // Trusted system path: authorization was enforced before buffering or inspecting any input.
    const report = await ingestUploadItems(req.payload, inputs.items)
    const rejected = [...inputs.rejected, ...report.rejected]
    const ok = report.bundles.length > 0 || report.skipped.length > 0
    return Response.json(
      {
        ok,
        count: report.bundles.length,
        bundles: report.bundles,
        rejected,
        skipped: [...inputs.skipped, ...report.skipped],
        ...(ok ? {} : { error: 'No files were imported. See the rejection report.' }),
      },
      { status: ok ? 200 : 422 },
    )
  },
}
