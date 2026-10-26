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
 *  - **Missing subjects/grades (SPEC §7, amended 2026-10-21):** without a `createTaxonomy` field, an
 *    upload that needs any returns **409** with `needsConfirmation` and the `missing` list, having
 *    written nothing. The client resubmits the same files with `createTaxonomy` = a JSON array of
 *    approved `{subject, grade}`; an approval the files do not need is a 400. Creation therefore
 *    shares this endpoint's Site-Admin gate — there is no second door.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isSiteAdmin } from '../access'
import { enforceUserRateLimit } from '../lib/rateLimit'
import { sendReleaseMessages } from '../ingest/releaseMessages'
import { ingestUploadItems } from '../ingest'
import { IngestError } from '../ingest/errors'
import type { TaxonomyKey } from '../ingest/taxonomy'
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

    const approvals = parseApprovals(form.get('createTaxonomy'))

    const confirmation = form.get('confirmOfficial')
    if (confirmation !== null && (typeof confirmation !== 'string' || confirmation.length > 200)) {
      throw new APIError('confirmOfficial must be a preview token', 400)
    }

    // Trusted system path: authorization was enforced before buffering or inspecting any input.
    let report: Awaited<ReturnType<typeof ingestUploadItems>>
    try {
      report = await ingestUploadItems(
        req.payload,
        inputs.items,
        approvals,
        typeof confirmation === 'string' ? confirmation : undefined,
      )
    } catch (e) {
      if (e instanceof IngestError) throw new APIError(e.message, 400)
      throw e
    }
    const rejected = [...inputs.rejected, ...report.rejected]
    const skipped = [...inputs.skipped, ...report.skipped]
    if (report.needsConfirmation) {
      return Response.json(
        {
          ok: false,
          needsConfirmation: true,
          missing: report.missing,
          official: report.official,
          previewToken: report.previewToken,
          confirmationChanged: report.confirmationChanged,
          count: 0,
          bundles: [],
          created: [],
          rejected,
          skipped,
          setRefused: [...inputs.setRefused, ...(report.setRefused ?? [])],
          waitingForProgram: inputs.waitingForProgram,
          warnings: inputs.warnings,
        },
        { status: 409 },
      )
    }
    report.messageWarnings = await sendReleaseMessages(req.payload, Number(req.user.id), report)
    const setRefused = [...inputs.setRefused, ...(report.setRefused ?? [])]
    const ok =
      report.bundles.length > 0 || report.skipped.length > 0 || inputs.waitingForProgram.length > 0
    return Response.json(
      {
        ok,
        count: report.bundles.length,
        bundles: report.bundles,
        created: report.created,
        rejected,
        skipped,
        officialMoved: report.bundles.filter((b) => b.outcome === 'officialMoved'),
        officialKept: report.bundles.filter((b) => b.outcome === 'officialKept'),
        alreadyHere: report.alreadyHere ?? [],
        olderNotImported: report.olderNotImported ?? [],
        waitingForProgram: inputs.waitingForProgram,
        warnings: inputs.warnings,
        setRefused,
        messageWarnings: report.messageWarnings,
        ...(ok ? {} : { error: 'No files were imported. See the rejection report.' }),
      },
      { status: ok ? 200 : 422 },
    )
  },
}

/** Most approvals one request may carry — far above any real upload (500 files at most). */
const MAX_APPROVALS = 500

/**
 * The `createTaxonomy` form field: absent → `undefined` (not asked yet); otherwise a JSON array of
 * `{subject, grade}` (possibly empty: "create nothing"). Anything malformed is a 400, never a guess.
 */
function parseApprovals(field: FormDataEntryValue | null): TaxonomyKey[] | undefined {
  if (field == null) return undefined
  const bad = () => new APIError('createTaxonomy must be a JSON array of {subject, grade}', 400)
  if (typeof field !== 'string') throw bad()
  let parsed: unknown
  try {
    parsed = JSON.parse(field)
  } catch {
    throw bad()
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_APPROVALS) throw bad()
  return parsed.map((item) => {
    const { subject, grade } = (item ?? {}) as { subject?: unknown; grade?: unknown }
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 200) throw bad()
    if (typeof grade !== 'number' || !Number.isInteger(grade)) throw bad()
    return { subject: subject.trim(), grade }
  })
}
