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
import { ingestItems, type IngestItem } from '../ingest'
import { IngestError } from '../ingest/errors'
import { extractAresJson } from '../ingest/extract'
import type { User } from '../payload-types'

const MAX_FILES = 50
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB/file (real bundles are ≪ 1 MB)

export const uploadBundlesEndpoint: Endpoint = {
  path: '/upload',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    if (!isSiteAdmin(req.user as User)) {
      throw new APIError('Forbidden — Site Administrator only', 403)
    }

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
