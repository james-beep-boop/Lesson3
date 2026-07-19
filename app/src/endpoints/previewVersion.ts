/**
 * Version preview endpoints (SPEC §5 content-preview tier, Official-version model) — view a
 * `lesson-bundle-version`'s generated documents as HTML in the browser. The version-model
 * gate philosophy with a script-free HTML page shell (shared via `previewShared.ts`), with the
 * version specifics:
 *
 *   - NO draft/published axis: every retained version is a valid snapshot (`findReadableVersion`).
 *   - Renders via `renderBundlePreview`, which the generator types natively to `LessonBundleVersion`.
 *
 * Mounted on the lesson-bundle-versions collection:
 *   - `GET  /api/lesson-bundle-versions/:id/preview` — the stored version.
 *   - `POST /api/lesson-bundle-versions/:id/preview` — the editor's CURRENT (possibly UNSAVED)
 *     form state, so an Editor can preview working-copy edits before saving. Values ride in a
 *     `data` field and are OVERLAID onto the stored, access-checked version.
 *   - `POST /api/lesson-bundle-versions/:id/preview-pdf?doc=<tag>` — the FORMATTED counterpart: the
 *     same unsaved working copy rendered as the real document (DOCX→PDF via Gotenberg), ONE deliverable
 *     chosen by `?doc=`, served inline. Same authz/field boundary; throttled by rate (the `previewPdf`
 *     bucket) AND concurrency (`lib/conversionLimit`).
 *
 * SECURITY (mirrors previewBundle): GET is READ-gated via `findReadableVersion`. The POST verbs are
 * gated HARDER — because they render caller-supplied content, they require EDIT authority
 * (`isEditorFor`) and then run the posted data through the real version field-split hook
 * (`enforceVersionFieldSplit`) so an Editor can preview only what they could actually save. The two
 * `/preview` verbs return HTML; `/preview-pdf` returns an inline PDF (never DOCX bytes) — none can be
 * an export bypass.
 *
 * NOTE: preview does NOT enforce version immutability — it persists nothing. An admin viewing an
 * Official (immutable) version's unsaved edits is harmless; saving them is separately rejected by
 * `enforceVersionImmutable`. The normal flow previews a forked, Not-Official working copy.
 */
import { APIError, Forbidden, type CollectionBeforeChangeHook, type Endpoint, type PayloadRequest } from 'payload'

import { assertPreviewable, parsePreviewCandidate, renderPreviewResponse } from './previewShared'
import { parseDeliverableTag } from './parseFormat'
import { findReadableVersion } from '../lib/readBundle'
import { enforceUserRateLimit } from '../lib/rateLimit'
import { acquireConversionSlot, releaseConversionSlot } from '../lib/conversionLimit'
import { isEditorFor, toId } from '../access'
import { enforceVersionFieldSplit } from '../hooks/bundleVersion'
import { bundleToAresData, versionDeliverables } from '../generator/adapter'
import { generateDeliverableDocx } from '../generator'
import { docxToPdf, PdfConversionError } from '../generator/docxToPdf'
import { deliverableStem, mimeFor, safePrefix } from '../generator/exportArtifacts'
import type { LessonBundleVersion, User } from '../payload-types'

/** Authorize the caller's READ access to the stored version; null → caller's 404. */
async function loadReadable(req: PayloadRequest, id: string): Promise<LessonBundleVersion> {
  const version = await findReadableVersion(req.payload, { id, user: req.user as User, req })
  if (!version) throw new APIError('Version not found', 404)
  return version
}

/**
 * Resolve the editor's CURRENT (possibly UNSAVED) working copy into the effective doc to render,
 * enforcing the SAME authorization + field boundary as the working-copy SAVE path. Shared by the
 * unsaved-preview (HTML) and preview-pdf (formatted) endpoints so a preview can never show more
 * than the caller could actually save, and the two verbs cannot drift on that gate:
 *
 *   1. READ-gate the stored version (`loadReadable`).
 *   2. AUTHORIZE as an EDIT, not a read (`isEditorFor`) — the field-split below trusts that update
 *      access already passed. A non-editor → 404.
 *   3. Overlay the posted content (pinning stored id/subjectGrade/lessonPlan — authority pinning,
 *      audit 2026-07-04) and run the real version save hook (`enforceVersionFieldSplit`): admin →
 *      unchanged; Editor → prose-only overlay; a structural change an Editor can't make → 422.
 */
async function resolveUnsavedEffective(req: PayloadRequest, id: string): Promise<LessonBundleVersion> {
  const stored = await loadReadable(req, id)

  if (!isEditorFor(req.user as User, toId(stored.subjectGrade))) {
    throw new APIError('Version not found', 404)
  }

  const candidate = await parsePreviewCandidate(req)

  const merged = {
    ...stored,
    ...candidate,
    id: stored.id,
    subjectGrade: stored.subjectGrade,
    lessonPlan: stored.lessonPlan,
  } as Record<string, unknown>
  try {
    return (enforceVersionFieldSplit as CollectionBeforeChangeHook)({
      data: merged,
      operation: 'update',
      originalDoc: stored,
      req,
    } as unknown as Parameters<CollectionBeforeChangeHook>[0]) as unknown as LessonBundleVersion
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
}

/** GET — preview the stored version. */
export const previewVersionEndpoint: Endpoint = {
  path: '/:id/preview',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const limited = await enforceUserRateLimit(req, 'preview')
    if (limited) return limited
    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing version id', 400)

    const version = await loadReadable(req, id)
    return renderPreviewResponse(req, version, false)
  },
}

/**
 * POST — preview the editor's CURRENT (possibly UNSAVED) form state. Authorization + field boundary
 * mirror the working-copy SAVE path, so a preview can never show more than the caller could save:
 *
 *   1. AUTHORIZE as an EDIT, not a read. Unsaved preview is an editing affordance, so it requires
 *      edit authority for the version's subject-grade (`isEditorFor`). A non-editor → 404.
 *   2. ENFORCE THE FIELD BOUNDARY by reusing the real version save hook (`enforceVersionFieldSplit`,
 *      a pure function) on the posted candidate: an Editor's admin-only/structural changes are
 *      stripped or rejected exactly as on save (Subject/Site Admins are unrestricted there).
 *
 * Output is HTML only, never DOCX bytes.
 */
export const previewVersionUnsavedEndpoint: Endpoint = {
  path: '/:id/preview',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const limited = await enforceUserRateLimit(req, 'preview')
    if (limited) return limited
    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing version id', 400)

    const effective = await resolveUnsavedEffective(req, id)
    return renderPreviewResponse(req, effective, true)
  },
}

/**
 * POST /:id/preview-pdf?doc=<tag> — the FORMATTED (accurate) counterpart to the HTML unsaved preview:
 * renders the editor's current UNSAVED working copy as the real document — the generator's own DOCX
 * run through the DOCX→PDF seam (Gotenberg), the same engine the export uses — served inline so it
 * opens in a browser tab. The HTML `/preview` stays the fast structural check; this is the accurate one.
 *
 * SCOPE: ONE deliverable, chosen by the required `?doc=<tag>` param (`lessonSequence` |
 * `finalExplanation` | `summaryTable`), so the editor's "View as PDF ▾" menu can preview whichever
 * document the user picks. A tag the bundle doesn't have (no Final Explanation / Summary Table) → 404.
 *
 * AUTHORIZATION + field boundary are IDENTICAL to the unsaved HTML preview (`resolveUnsavedEffective`)
 * — a preview can never show more than the caller could save. Output is a PDF only, never DOCX bytes.
 *
 * THROTTLING (two layers, since this runs Gotenberg IN the request, unlike the async export path):
 *   - RATE: the dedicated `previewPdf` bucket (tighter than `export`).
 *   - CONCURRENCY: a non-blocking in-process slot (`acquireConversionSlot`) — a full slot table → 503,
 *     so a burst can't pin many multi-second conversions and exhaust request slots.
 *
 * The SAVED-version path is not here: a stored version's formatted PDF is served by the existing
 * export endpoints (cached + pre-warmed), which the toolbar reuses for a pristine form.
 */
export const previewVersionPdfEndpoint: Endpoint = {
  path: '/:id/preview-pdf',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const limited = await enforceUserRateLimit(req, 'previewPdf')
    if (limited) return limited
    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing version id', 400)

    const tag = parseDeliverableTag(req) // validates ?doc=<tag>; 400 on a bad/missing tag
    const effective = await resolveUnsavedEffective(req, id)

    // Same completeness gate the HTML preview uses (shared, so they can't drift): an incomplete draft
    // is an EXPECTED 422 with the specific reasons, not a generator 500.
    assertPreviewable(effective, true)

    // 404 for a tag this bundle has no content for (e.g. no Final Explanation) — checked BEFORE
    // taking a conversion slot, so the cheap miss doesn't hold heavy-work capacity.
    if (!versionDeliverables(effective).includes(tag)) {
      throw new APIError('This lesson plan has no such document.', 404)
    }

    // Concurrency bound (see lib/conversionLimit): refuse rather than pile up when saturated.
    if (!acquireConversionSlot()) {
      throw new APIError('The PDF preview service is busy — please try again in a moment.', 503)
    }

    // Filename stem mirrors the export naming (single-sourced via `deliverableStem`) so the inline
    // PDF's suggested name matches a downloaded copy of the same document.
    const stem = deliverableStem(tag, safePrefix(effective.meta?.filePrefix))

    let pdf: Buffer
    try {
      // Build ONLY the requested deliverable (not all three), then convert it.
      const docx = await generateDeliverableDocx(bundleToAresData(effective), tag)
      // Presence was checked above, so a non-primary tag resolves to a Buffer here.
      pdf = await docxToPdf(docx as Buffer, `${stem}.docx`)
    } catch (err) {
      if (err instanceof PdfConversionError) {
        req.payload.logger.error({ err, docId: effective.id }, 'preview-pdf conversion failed')
        throw new APIError('Could not convert this preview to PDF — please try again.', 502)
      }
      // Completeness already passed, so a throw here is a real generator failure, not a draft.
      req.payload.logger.error({ err, docId: effective.id }, 'preview-pdf render failed')
      throw new APIError('Could not render this preview.', 500)
    } finally {
      releaseConversionSlot()
    }

    // A zero-copy view over the Buffer (it owns a dedicated ArrayBuffer from docxToPdf's
    // arrayBuffer(), offset 0), matching the export endpoint's serve pattern.
    return new Response(new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength), {
      status: 200,
      headers: {
        'Content-Type': mimeFor('pdf'),
        'Content-Disposition': `inline; filename="${stem}.pdf"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(pdf.length),
      },
    })
  },
}
