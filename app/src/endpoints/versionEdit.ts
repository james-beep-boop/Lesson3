/**
 * Version edit endpoints (Stage 2 editing model), mounted on `lesson-bundle-versions`:
 *
 *   - POST /:id/save-as-new   — write the editor's submitted content as a NEW candidate version of this
 *                                plan (field-split enforced vs the source); never moves the Official
 *                                pointer. The source stays an immutable snapshot.
 *   - POST /:id/make-official — point this version's plan at it (move `officialVersion`; no content copy).
 *
 * AUTHORIZATION is enforced HERE (state-changing POSTs, CSRF-guarded by the SameSite=Lax cookie):
 *   - save-as-new: Editor or admin for the version's subject-grade (Editor edits are prose-only).
 *   - make-official: Subject/Site Admin only (designating Official is an admin action).
 * A caller without the required role gets 403.
 */
import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type Endpoint,
  type PayloadRequest,
} from 'payload'

import { isEditorFor, isSubjectAdminFor, toId } from '../access'
import { applyEditorFieldSplit } from '../hooks/fieldSplit'
import { isOfficialVersion, VERSION_EDITOR_KEYS } from '../hooks/bundleVersion'
import { parsePreviewCandidate } from './previewParse'
import { isSemverConflict, nextSemverForPlan } from '../lib/semver'
import { stripIds } from '../lib/stripIds'
import { findReadableVersion } from '../lib/readBundle'
import type { LessonBundleVersion, User } from '../payload-types'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Content keys NOT carried into a forked copy (identity/version metadata + Payload internals).
 *  `author` is stamped server-side from the authenticated caller — a submitted value is never trusted. */
const DROP_KEYS = new Set(['id', 'semver', 'sourceVersion', 'author', 'createdAt', 'updatedAt'])

/** How many times to retry `save-as-new` when two concurrent saves race for the same next semver. */
const SEMVER_CONFLICT_RETRIES = 4

/** Load the version with the caller's READ access, then require `role` authority for its grade. */
async function authorize(
  req: PayloadRequest,
  role: 'editor' | 'admin',
): Promise<LessonBundleVersion> {
  if (!req.user) throw new APIError('Unauthorized', 401)
  const id = req.routeParams?.id as string | undefined
  if (!id) throw new APIError('Missing version id', 400)

  const version = await findReadableVersion(req.payload, { id, user: req.user as User, req })
  if (!version) throw new APIError('Version not found', 404)
  const sgId = toId(version.subjectGrade as never)
  const ok =
    role === 'admin'
      ? isSubjectAdminFor(req.user as User, sgId)
      : isEditorFor(req.user as User, sgId)
  if (!ok) throw new APIError('Not allowed', 403)
  return version
}

/**
 * POST /:id/save-as-new — save the editor's current form content as a NEW candidate version of this
 * plan (Stage 2 editing model). Does NOT move the Official pointer — designating Official is a separate
 * admin-only action (`make-official`). Editor authorship is enforced server-side: the submitted content
 * is run through `applyEditorFieldSplit` against THIS version as the source, so an Editor's structural /
 * META changes are ignored (prose only); a Subject/Site Admin's edits pass through. Body: multipart with
 * a `data` field carrying the JSON nested bundle (same shape the preview endpoint accepts).
 *
 * Returns the new version + the source's identity so the client can offer to delete the source (only
 * when it is NOT the live Official — that guard is the client's, but `sourceIsOfficial` is computed here).
 */
export const saveAsNewEndpoint: Endpoint = {
  path: '/:id/save-as-new',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const source = await authorize(req, 'editor')
    const planId = toId(source.lessonPlan as never)
    if (planId == null) throw new APIError('Version has no lesson plan', 409)

    // Body guards (Content-Length pre-check, byte cap, JSON + object-shape) shared with the preview
    // parser — this is an authenticated endpoint accepting large nested content.
    const edited = await parsePreviewCandidate(req)

    // Stale-source guard (mandatory): the submitted base `updatedAt` must be present, valid, and not
    // predate the source's current value. A missing/garbage base is rejected (400) rather than silently
    // skipped — this is the write boundary, so the contract is enforced, not optional; if the source has
    // advanced since the editor opened it, reject (409) so they reload instead of branching from stale
    // content. (Equal-or-newer is allowed, tolerant of timestamp serialization.)
    const baseMs = Date.parse(String(edited.updatedAt ?? ''))
    const srcMs = Date.parse(String(source.updatedAt))
    if (!Number.isFinite(baseMs)) {
      throw new APIError('Missing or invalid base version timestamp — reload before saving.', 400)
    }
    if (Number.isFinite(srcMs) && baseMs < srcMs) {
      throw new APIError('This version changed since you opened it — reload before saving.', 409)
    }

    // Enforce Editor-prose-only: overlay the submitted prose onto THIS version (the source) and preserve
    // its admin/structure fields. Admins (and the system) pass through unchanged. Cardinality/order
    // changes by an Editor are rejected inside the helper.
    const merged = applyEditorFieldSplit({
      data: { ...edited, subjectGrade: toId(source.subjectGrade as never) },
      originalDoc: source as unknown as Record<string, unknown>,
      operation: 'update',
      req,
      editorTopLevelKeys: VERSION_EDITOR_KEYS,
    }) as Record<string, unknown>

    // Strip identity/version metadata + row ids so the new candidate gets fresh ones (as fork does).
    const content = stripIds(
      Object.fromEntries(Object.entries(merged).filter(([k]) => !DROP_KEYS.has(k))),
    ) as Record<string, unknown>

    // Create the candidate and (optionally) delete the source in ONE DB transaction, so "replace this
    // draft with my edits" is genuinely atomic: if either step fails, nothing persists. The Official is
    // never deleted (re-checked + `enforceOfficialNotDeletable` backstop); deletion skipped if Official.
    //
    // Retry on a `(lessonPlan, semver)` conflict: a concurrent save on the same plan may grab the next
    // patch first, poisoning this transaction. We can't recompute inside the aborted transaction (Postgres
    // requires a rollback first), so each attempt is its OWN transaction — kill, recompute the semver
    // against freshly-committed state, and try again. Integrity was always safe (the index rejects the
    // dup); this just turns a rare 500 into a transparent retry.
    const deleteSource = req.query?.deleteSource === 'true'

    // Delete-source permission (IA redesign 2026-07-01, mirrors `lessonBundleVersionDelete`): admins in
    // scope may delete any source; an Editor only a source THEY authored. The delete below runs via
    // overrideAccess inside the transaction, so the rule is enforced here; when not permitted the save
    // still succeeds and the source is simply kept (`sourceDeleted: false` reports it).
    const caller = req.user as User
    const mayDeleteSource =
      isSubjectAdminFor(caller, toId(source.subjectGrade as never)) ||
      (toId(source.author as never) != null && toId(source.author as never) === caller.id)

    for (let attempt = 0; ; attempt++) {
      const shouldCommit = await initTransaction(req)
      try {
        // overrideAccess: authorship was just enforced via the field-split (same trust model as fork); this
        // also lets an Editor create a version (the collection create access is admin-only).
        const created = await req.payload.create({
          collection: 'lesson-bundle-versions',
          data: {
            ...content,
            lessonPlan: planId,
            subjectGrade: toId(source.subjectGrade as never),
            semver: await nextSemverForPlan(req.payload, planId, req),
            sourceVersion: source.id,
            // Authorship stamp: the authenticated caller saved this candidate. Never taken from the
            // submitted content (DROP_KEYS) — drives the Editor delete scope ("My saved versions").
            author: caller.id,
          } as never,
          req,
          overrideAccess: true,
        })

        const sourceIsOfficial = await isOfficialVersion(req, planId, source.id)
        let sourceDeleted = false
        if (deleteSource && !sourceIsOfficial && mayDeleteSource) {
          await req.payload.delete({
            collection: 'lesson-bundle-versions',
            id: source.id,
            overrideAccess: true,
            req,
          })
          sourceDeleted = true
        }

        if (shouldCommit) await commitTransaction(req)
        return json({
          id: created.id,
          adminUrl: `/admin/collections/lesson-bundle-versions/${created.id}`,
          sourceId: source.id,
          sourceLabel: source.title ?? source.semver ?? `v${source.id}`,
          sourceIsOfficial,
          sourceDeleted,
        })
      } catch (e) {
        await killTransaction(req)
        if (isSemverConflict(e) && attempt < SEMVER_CONFLICT_RETRIES) continue
        throw e
      }
    }
  },
}

/**
 * POST /:id/make-official — move this version's plan pointer to it (no content copy). Optionally, with
 * `?deletePrevious=true`, atomically delete the version that WAS Official (now superseded) in the same
 * handler — so "promote this and drop the old one" is one operation. The new Official is never the one
 * deleted; a no-op if the plan had no previous Official.
 *
 * `?expectedPreviousOfficialId=` is a stale-state guard, REQUIRED whenever `deletePrevious=true`
 * (400 absent, 409 mismatch): the delete-previous consent the user gave was ABOUT the version that
 * was Official when their page rendered. If another admin moved the pointer since, deleting the
 * now-current previous would destroy a version nobody agreed to lose. Mandatory server-side so the
 * safety never depends on which client calls the API (Codex audit 2026-07-01 #2 + round-2 #1).
 */
export const makeOfficialEndpoint: Endpoint = {
  path: '/:id/make-official',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const version = await authorize(req, 'admin')
    const planId = toId(version.lessonPlan as never)
    if (planId == null) throw new APIError('Version has no lesson plan', 409)

    // Pointer move + optional cleanup in ONE transaction, so promote-and-delete-previous is atomic
    // (a failed cleanup rolls back the pointer move rather than leaving a half-applied promotion).
    const deletePrevious = req.query?.deletePrevious === 'true'
    const expectedPreviousRaw = req.query?.expectedPreviousOfficialId
    // The destructive half requires naming its object — mandatory, so a scripted/direct API caller
    // gets the same protection as the UI (which always sends it; '' when the plan had no Official).
    if (deletePrevious && expectedPreviousRaw == null) {
      throw new APIError(
        'expectedPreviousOfficialId is required when deleting the previous Official version.',
        400,
      )
    }
    const shouldCommit = await initTransaction(req)
    try {
      // Capture the current (about-to-be-previous) Official before moving the pointer.
      const planBefore = (await req.payload.findByID({
        collection: 'lesson-plans',
        id: planId,
        depth: 0,
        overrideAccess: true,
        req,
      })) as { officialVersion?: unknown }
      const previousOfficialId = toId(planBefore.officialVersion as never)

      // Stale-consent check (the required param was validated above). The promotion itself is not
      // gated — it is idempotent-safe and re-runnable; only the delete is irreversible.
      if (deletePrevious && String(expectedPreviousRaw) !== String(previousOfficialId ?? '')) {
        throw new APIError(
          'The Official version changed since you loaded this page — reload before deleting the previous version.',
          409,
        )
      }

      // Field access (`canSetOfficialVersion`) + `validateOfficialVersionPointer` gate/validate this.
      await req.payload.update({
        collection: 'lesson-plans',
        id: planId,
        data: { officialVersion: version.id } as never,
        req,
        overrideAccess: false,
        user: req.user,
      })

      // The previous Official is now non-Official → deletable (and only now). Skip if it is the one we
      // just promoted or there was none.
      let previousDeleted = false
      if (
        deletePrevious &&
        previousOfficialId != null &&
        String(previousOfficialId) !== String(version.id)
      ) {
        await req.payload.delete({
          collection: 'lesson-bundle-versions',
          id: previousOfficialId,
          overrideAccess: true,
          req,
        })
        previousDeleted = true
      }

      if (shouldCommit) await commitTransaction(req)
      return json({ ok: true, officialVersion: version.id, previousOfficialId, previousDeleted })
    } catch (e) {
      await killTransaction(req)
      throw e
    }
  },
}
