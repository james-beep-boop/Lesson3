/**
 * Preview endpoint (SPEC §5 content-preview tier) — view a bundle's generated documents
 * as HTML in the browser. Companion to the export endpoint, with two deliberate differences:
 *
 *   - DRAFT-CAPABLE: reads the latest (draft) snapshot (`findReadableBundle(draft:true)`),
 *     so an Editor can preview in-progress work before publishing. It is NOT published-only.
 *   - HTML, NOT a download: returns a self-contained `text/html` page (mammoth content view),
 *     never DOCX bytes — so it can never be an export bypass.
 *
 * Mounted on the lesson-bundles collection:
 *   - `GET  /api/lesson-bundles/:id/preview` — the latest SAVED snapshot.
 *   - `POST /api/lesson-bundles/:id/preview` — the editor's CURRENT (possibly UNSAVED) form
 *     state, so an editor can preview edits without saving first (SPEC §5). The form values
 *     ride in a `data` field; they are OVERLAID onto the stored, access-checked bundle.
 * Query: `?format=standard|compact` (LessonSequence layout; FE/ST are identical).
 *
 * SECURITY: authorization is enforced HERE. GET is READ-gated via `findReadableBundle`
 * (`overrideAccess:false` + `user`), exactly like the export endpoint — a Teacher only matches
 * published bundles, so a draft is "not found" (404) for them. POST is gated HARDER: because it
 * renders caller-supplied content, it requires EDIT authority (`isEditorFor`) and then runs the
 * posted data through the real save hook (`enforceBundleStructure`) so an Editor can preview
 * only what they could actually save. Both verbs return HTML only, never DOCX bytes.
 */
import { APIError, Forbidden, type CollectionBeforeChangeHook, type Endpoint, type PayloadRequest } from 'payload'

import { renderBundlePreview, type PreviewSection } from '../generator/previewBundle'
import { parseLessonSequenceFormat } from './parseFormat'
import { validateGeneratable } from '../ingest/validateGeneratable'
import { findReadableBundle } from '../lib/readBundle'
import { isEditorFor, toId } from '../access'
import { enforceBundleStructure } from '../hooks/bundleIntegrity'
import type { LessonBundle, User } from '../payload-types'

/** Cap the posted form-state JSON before we parse + generate from it (defence against a
 *  memory/CPU-heavy preview). Bundles are large prose, so this is generous; true per-request
 *  body limiting + rate-limiting is the deferred production-hardening item (Codex #2/#3). */
const MAX_PREVIEW_JSON_BYTES = 4_000_000

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

/** Wrap the rendered sections in a minimal, self-contained, script-free HTML page. */
function previewPage(
  title: string,
  format: string,
  sections: PreviewSection[],
  unsaved: boolean,
): string {
  const body = sections
    .map(
      (s) =>
        `<section class="doc-section"><h2>${escapeHtml(s.label)}</h2><div class="doc">${s.html}</div></section>`,
    )
    .join('\n')
  // POST previews render the in-editor form state, which may differ from what's stored.
  const provenance = unsaved ? 'unsaved edits' : 'latest saved version'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Preview — ${escapeHtml(title)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  .page-head { color: #666; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
  h1 { margin: 0.2rem 0 1.5rem; }
  .doc-section + .doc-section { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 2px solid #ddd; }
  .doc-section h2 { color: #666; font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .doc { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  td, th { border: 1px solid #ccc; padding: 0.4rem 0.55rem; vertical-align: top; text-align: left; }
</style></head>
<body>
  <p class="page-head">Content preview · ${escapeHtml(format)} · ${escapeHtml(provenance)} · not the final document layout</p>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body></html>`
}

/** Shared response headers: a script-free, self-contained HTML page (no external loads). */
const PREVIEW_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
} as const

/**
 * Validate completeness → render → wrap → respond. Shared by both verbs so the GET (saved)
 * and POST (unsaved) paths cannot drift on gating, error semantics, or CSP. Distinguishes an
 * EXPECTED incomplete draft (422, with the specific reasons) from an UNEXPECTED render
 * failure (500); `validateGeneratable` is the same completeness gate the publish hook uses.
 */
async function renderPreviewResponse(
  req: PayloadRequest,
  bundle: LessonBundle,
  format: ReturnType<typeof parseLessonSequenceFormat>,
  unsaved: boolean,
): Promise<Response> {
  const problems = validateGeneratable(bundle)
  if (problems.length > 0) {
    const fix = unsaved ? 'fill in' : 'fill in and save'
    throw new APIError(`This bundle can’t be previewed yet — ${fix}: ${problems.join(' ')}`, 422)
  }

  let sections: PreviewSection[]
  try {
    sections = await renderBundlePreview(bundle, format)
  } catch (err) {
    // Completeness already passed, so a throw here is a real generator/converter failure,
    // not an incomplete draft — log it and surface a 500 instead of masking it as "not ready".
    req.payload.logger.error({ err, bundleId: bundle.id }, 'preview render failed')
    throw new APIError('Could not render this preview.', 500)
  }

  const html = previewPage(bundle.title ?? 'Lesson bundle', format, sections, unsaved)
  return new Response(html, { status: 200, headers: PREVIEW_HEADERS })
}

/** Authorize the caller's READ access to the stored (draft) bundle; null → caller's 404. */
async function loadReadable(req: PayloadRequest, id: string): Promise<LessonBundle> {
  const bundle = await findReadableBundle(req.payload, {
    id,
    user: req.user as User,
    req,
    draft: true,
  })
  if (!bundle) throw new APIError('Bundle not found', 404)
  return bundle
}

/** GET — preview the latest SAVED snapshot. */
export const previewBundleEndpoint: Endpoint = {
  path: '/:id/preview',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing bundle id', 400)

    const format = parseLessonSequenceFormat(req)
    const bundle = await loadReadable(req, id)
    return renderPreviewResponse(req, bundle, format, false)
  },
}

/**
 * POST — preview the editor's CURRENT (possibly UNSAVED) form state. The form values arrive
 * in a `data` field (sent by the admin Preview control). Authorization + field boundary mirror
 * the SAVE path, so a preview can never show more than the caller could actually save:
 *
 *   1. AUTHORIZE as an EDIT, not a read. Unsaved preview is an editing affordance, so it
 *      requires edit authority for the bundle's subject-grade (`isEditorFor`) — read access
 *      alone (which any Teacher has for published bundles) is NOT enough. A non-editor → 404.
 *   2. ENFORCE THE FIELD BOUNDARY by reusing the real save hook (`enforceBundleStructure`,
 *      a pure function) on the posted candidate: an Editor's admin-only/structural changes are
 *      stripped or rejected exactly as on save (Subject/Site Admins are unrestricted there).
 *      Reusing the hook — not a parallel whitelist — means preview and save can't drift.
 *
 * Output is HTML only, never DOCX bytes.
 */
export const previewBundleUnsavedEndpoint: Endpoint = {
  path: '/:id/preview',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing bundle id', 400)

    const format = parseLessonSequenceFormat(req)
    const stored = await loadReadable(req, id)

    // 1. Edit-authority gate (not just read): the save hook below trusts that update access
    //    already passed, so we must check it here before applying the hook's whitelist.
    if (!isEditorFor(req.user as User, toId(stored.subjectGrade))) {
      throw new APIError('Bundle not found', 404)
    }

    let form: FormData
    try {
      form = await req.formData!()
    } catch {
      throw new APIError('Expected a form post with a "data" field', 400)
    }
    const raw = form.get('data')
    if (typeof raw !== 'string') throw new APIError('Missing "data" field', 400)
    if (raw.length > MAX_PREVIEW_JSON_BYTES) throw new APIError('Preview payload too large', 413)

    let candidate: unknown
    try {
      candidate = JSON.parse(raw)
    } catch {
      throw new APIError('Invalid JSON in "data" field', 400)
    }
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new APIError('"data" must be a bundle object', 400)
    }

    // 2. Overlay the posted content over the stored bundle (pin stored id/_status), then run
    //    the SAME field-boundary the save path enforces. enforceBundleStructure is a pure
    //    sync function: it returns the effective doc for this user (admin → unchanged; Editor
    //    → prose-only overlay) and throws Forbidden on a structural change an Editor can't make.
    const merged = {
      ...stored,
      ...(candidate as Record<string, unknown>),
      id: stored.id,
      _status: stored._status,
    } as LessonBundle
    let effective: LessonBundle
    try {
      effective = (enforceBundleStructure as CollectionBeforeChangeHook)({
        data: merged,
        operation: 'update',
        originalDoc: stored,
        req,
      } as unknown as Parameters<CollectionBeforeChangeHook>[0]) as LessonBundle
    } catch (e) {
      if (e instanceof Forbidden) {
        throw new APIError(
          'Only prose edits can be previewed — structural changes (adding or reordering rows) ' +
            'must be made by a Subject Administrator.',
          422,
        )
      }
      throw e
    }
    return renderPreviewResponse(req, effective, format, true)
  },
}
