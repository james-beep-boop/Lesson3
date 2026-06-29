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
 * Query: `?format=standard|compact` (LessonSequence layout; FE/ST are identical).
 *
 * SECURITY (mirrors previewBundle): GET is READ-gated via `findReadableVersion`. POST is gated
 * HARDER — because it renders caller-supplied content, it requires EDIT authority (`isEditorFor`)
 * and then runs the posted data through the real version field-split hook (`enforceVersionFieldSplit`)
 * so an Editor can preview only what they could actually save. Both verbs return HTML only.
 *
 * NOTE: preview does NOT enforce version immutability — it persists nothing. An admin viewing an
 * Official (immutable) version's unsaved edits is harmless; saving them is separately rejected by
 * `enforceVersionImmutable`. The normal flow previews a forked, Not-Official working copy.
 */
import { APIError, Forbidden, type CollectionBeforeChangeHook, type Endpoint, type PayloadRequest } from 'payload'

import { parseLessonSequenceFormat } from './parseFormat'
import { parsePreviewCandidate, renderPreviewResponse } from './previewShared'
import { findReadableVersion } from '../lib/readBundle'
import { enforceUserRateLimit } from '../lib/rateLimit'
import { isEditorFor, toId } from '../access'
import { enforceVersionFieldSplit } from '../hooks/bundleVersion'
import type { LessonBundleVersion, User } from '../payload-types'

/** Authorize the caller's READ access to the stored version; null → caller's 404. */
async function loadReadable(req: PayloadRequest, id: string): Promise<LessonBundleVersion> {
  const version = await findReadableVersion(req.payload, { id, user: req.user as User, req })
  if (!version) throw new APIError('Version not found', 404)
  return version
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

    const format = parseLessonSequenceFormat(req)
    const version = await loadReadable(req, id)
    return renderPreviewResponse(req, version, format, false)
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

    const format = parseLessonSequenceFormat(req)
    const stored = await loadReadable(req, id)

    // 1. Edit-authority gate (not just read): the field-split hook below trusts that update access
    //    already passed, so we must check it here before applying its whitelist.
    if (!isEditorFor(req.user as User, toId(stored.subjectGrade))) {
      throw new APIError('Version not found', 404)
    }

    const candidate = await parsePreviewCandidate(req)

    // 2. Overlay the posted content over the stored version (pin stored id), then run the SAME
    //    field-boundary the working-copy save path enforces. enforceVersionFieldSplit is a pure
    //    sync function: it returns the effective doc for this user (admin → unchanged; Editor →
    //    prose-only overlay) and throws Forbidden on a structural change an Editor can't make.
    const merged = {
      ...stored,
      ...candidate,
      id: stored.id,
    } as Record<string, unknown>
    let effective: LessonBundleVersion
    try {
      effective = (enforceVersionFieldSplit as CollectionBeforeChangeHook)({
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
    return renderPreviewResponse(req, effective, format, true)
  },
}
