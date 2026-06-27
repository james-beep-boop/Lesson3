/**
 * Unsaved-preview POST body parse (SPEC §5) — split out of `previewShared.ts` so it can be unit
 * tested WITHOUT pulling in the generator/converter chain (`renderBundlePreview` → vendored docx +
 * mammoth), which is too heavy for the DB-free unit environment. `previewShared.ts` re-exports this
 * so the existing import sites are unchanged. Depends only on `APIError`/`PayloadRequest`.
 */
import { APIError, type PayloadRequest } from 'payload'

/** Cap the posted form-state JSON before we parse + generate from it. Bundles are large prose, so
 *  this is generous. NOTE: this is a soft memory guard, not a hard DoS boundary — the precise check
 *  runs AFTER `formData()` has buffered the multipart body; the Content-Length pre-check below
 *  rejects pathological bodies before buffering, but only when the header is present and honest.
 *  Per-user rate limiting also guards both preview verbs (see enforceUserRateLimit). */
export const MAX_PREVIEW_JSON_BYTES = 4_000_000

/** Coarse cap for the WHOLE multipart request body (the Content-Length pre-parse guard). It must sit
 *  ABOVE {@link MAX_PREVIEW_JSON_BYTES} by enough to cover multipart framing (boundary lines +
 *  Content-Disposition headers), or a legitimate `data` field just under the field cap would be
 *  rejected by the few hundred bytes of overhead. 64 KiB is comfortably more than real framing while
 *  still bounding pathological bodies before they are buffered. The precise field cap below is the
 *  authority on the `data` payload itself. */
const MAX_PREVIEW_BODY_BYTES = MAX_PREVIEW_JSON_BYTES + 64 * 1024

/** 413 message shared by the pre-parse (Content-Length) and post-parse (byte-count) size guards. */
const PAYLOAD_TOO_LARGE = 'Preview payload too large'

/**
 * Parse + validate the posted form-state for an UNSAVED preview (the `data` field of the admin
 * Preview control's hidden form). Keeps the GET/POST verbs from drifting on the size limit, JSON
 * validation, or 400/413 semantics. Returns the candidate object; the caller overlays it onto the
 * stored version and runs the field-split hook (the part that genuinely differs).
 */
export async function parsePreviewCandidate(
  req: PayloadRequest,
): Promise<Record<string, unknown>> {
  // Coarse pre-parse guard: reject an oversized body via Content-Length BEFORE `formData()` buffers
  // the whole multipart payload into memory. Compared against the larger BODY cap (field cap +
  // framing overhead) so a valid near-limit `data` field is not falsely rejected; the header may be
  // absent or wrong, so the precise per-field cap below is the authority.
  const declaredLength = Number(req.headers?.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PREVIEW_BODY_BYTES) {
    throw new APIError(PAYLOAD_TOO_LARGE, 413)
  }

  let form: FormData
  try {
    form = await req.formData!()
  } catch {
    throw new APIError('Expected a form post with a "data" field', 400)
  }
  const raw = form.get('data')
  if (typeof raw !== 'string') throw new APIError('Missing "data" field', 400)
  // Measure UTF-8 bytes (not `raw.length`, which counts UTF-16 code units) so multibyte prose is
  // bounded by the byte budget the constant names.
  if (Buffer.byteLength(raw, 'utf8') > MAX_PREVIEW_JSON_BYTES) {
    throw new APIError(PAYLOAD_TOO_LARGE, 413)
  }

  let candidate: unknown
  try {
    candidate = JSON.parse(raw)
  } catch {
    throw new APIError('Invalid JSON in "data" field', 400)
  }
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new APIError('"data" must be a version object', 400)
  }
  return candidate as Record<string, unknown>
}
