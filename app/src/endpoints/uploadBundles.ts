/**
 * Site-Admin lesson-plan UPLOAD endpoint (SPEC §7 deviation — see docs/DECISIONS.md 2026-06-13).
 *
 * Mounted on lesson-plans → `POST /api/lesson-plans/upload` (multipart, field `files`).
 * Accepts ARES `.json` exports only, parses each with the SAFE `extractAresJson` (JSON.parse +
 * structural guards — never executes input), and creates Official 1.0.0 lesson-plan versions
 * via the shared upload/import core.
 *
 * SECURITY — this is the authorization boundary that makes a web ingest surface acceptable:
 *  - **Site Administrator only**, enforced HERE server-side (`isSiteAdmin`) — the hidden UI
 *    button is convenience, not the gate.
 *  - **JSON only, parse-never-execute.** No `.js` over the web (that stays the dev CLI); the
 *    `.js` RCE concern that kept ingest off HTTP (SPEC §7) does not apply to JSON.parse.
 *  - **Size/count caps** bound the request; the same validate + taxonomy gates as the CLI run
 *    in pre-flight; the batch is all-or-nothing.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isSiteAdmin } from '../access'
import { enforceUserRateLimit } from '../lib/rateLimit'
import { ingestItems, type IngestItem } from '../ingest'
import { IngestError } from '../ingest/errors'
import { extractAresJson } from '../ingest/extract'
import type { User } from '../payload-types'
import { assertDeclaredBodyWithin } from './respond'

const MAX_FILES = 50
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB/file (real bundles are ≪ 1 MB)
// Coarse cap for the WHOLE multipart request body — the Content-Length pre-parse guard. Sits above the
// aggregate per-file budget by enough to cover multipart framing (boundaries + headers per part), so a
// valid max-sized batch is never falsely rejected; the precise per-file caps below remain the authority.
const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 256 * 1024

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

    const items: IngestItem[] = []
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new APIError(`Only .json files are accepted (got "${file.name}")`, 400)
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new APIError(`"${file.name}" exceeds the ${MAX_FILE_BYTES}-byte limit`, 400)
      }
      const content = await file.text()
      // Thunk: parsing happens in the ingest pre-flight so a bad file is aggregated, not fatal.
      items.push({ name: file.name, extract: () => extractAresJson(content) })
    }

    try {
      // ingestItems is a trusted system path; authorization is already enforced above.
      const bundles = await ingestItems(req.payload, items)
      return Response.json({ ok: true, count: bundles.length, bundles })
    } catch (e) {
      if (e instanceof IngestError) {
        // Pre-flight failures (bad JSON, missing groups, unresolved taxonomy, not generatable)
        // → 422 with the actionable per-file message; nothing was written.
        return Response.json({ ok: false, error: e.message }, { status: 422 })
      }
      throw e
    }
  },
}
