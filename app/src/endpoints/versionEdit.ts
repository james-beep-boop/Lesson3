/**
 * Working-copy edit endpoints (SPEC §6, Stage 2b), mounted on `lesson-bundle-versions`:
 *
 *   - POST /:id/fork           — create a Not-Official working copy from this version (content copy,
 *                                semver patch-bump, `sourceVersion` set) and return its admin URL.
 *   - POST /:id/make-official  — point this version's plan at it (move `officialVersion`; no content
 *                                copy). The version then becomes immutable (enforceVersionImmutable).
 *
 * AUTHORIZATION is enforced HERE (both are state-changing POSTs, CSRF-guarded by the SameSite=Lax
 * cookie):
 *   - fork: Editor or admin for the version's subject-grade (Editors start editing by forking).
 *   - make-official: Subject/Site Admin only (marking Official is an admin action).
 * A caller without the required role gets 403.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isEditorFor, isSubjectAdminFor, toId } from '../access'
import { applyEditorFieldSplit } from '../hooks/fieldSplit'
import { VERSION_EDITOR_KEYS } from '../hooks/bundleVersion'
import { nextSemverForPlan } from '../lib/semver'
import { stripIds } from '../lib/stripIds'
import { findReadableVersion } from '../lib/readBundle'
import type { LessonBundleVersion, User } from '../payload-types'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Content keys NOT carried into a forked copy (identity/version metadata + Payload internals). */
const DROP_KEYS = new Set(['id', 'semver', 'sourceVersion', 'createdAt', 'updatedAt'])

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

/** POST /:id/fork — create a Not-Official working copy and return its admin URL. */
export const forkVersionEndpoint: Endpoint = {
  path: '/:id/fork',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const source = await authorize(req, 'editor')

    const content = stripIds(
      Object.fromEntries(
        Object.entries(source as unknown as Record<string, unknown>).filter(([k]) => !DROP_KEYS.has(k)),
      ),
    ) as Record<string, unknown>

    const planId = toId(source.lessonPlan as never)
    if (planId == null) throw new APIError('Version has no lesson plan', 409)

    // overrideAccess: the fork is a TRUSTED faithful copy of admin-authored content, not
    // Editor-authored input — authorization was enforced above. This also avoids the version
    // create access (admin-only) so an Editor can still start a working copy.
    const working = await req.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...content,
        lessonPlan: planId,
        subjectGrade: toId(source.subjectGrade as never),
        // Next free patch across the plan's versions (not a blind bump of the source) so two forks of
        // the same source don't collide; the unique (lessonPlan, semver) index is the hard backstop.
        semver: await nextSemverForPlan(req.payload, planId, req),
        sourceVersion: source.id,
      } as never,
      req,
      overrideAccess: true,
    })

    return json({
      id: working.id,
      adminUrl: `/admin/collections/lesson-bundle-versions/${working.id}`,
    })
  },
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

    let edited: Record<string, unknown> | undefined
    try {
      const raw = (await req.formData!()).get('data')
      edited = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : undefined
    } catch {
      throw new APIError('Expected a multipart body with a JSON "data" field', 400)
    }
    if (!edited) throw new APIError('Missing edited content', 400)

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
      } as never,
      req,
      overrideAccess: true,
    })

    const plan = (await req.payload.findByID({
      collection: 'lesson-plans',
      id: planId,
      depth: 0,
      overrideAccess: true,
      req,
    })) as { officialVersion?: unknown }
    const sourceIsOfficial = String(toId(plan.officialVersion as never) ?? '') === String(source.id)

    return json({
      id: created.id,
      adminUrl: `/admin/collections/lesson-bundle-versions/${created.id}`,
      sourceId: source.id,
      sourceLabel: source.title ?? source.semver ?? `v${source.id}`,
      sourceIsOfficial,
    })
  },
}

/** POST /:id/make-official — move this version's plan pointer to it (no content copy). */
export const makeOfficialEndpoint: Endpoint = {
  path: '/:id/make-official',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const version = await authorize(req, 'admin')
    const planId = toId(version.lessonPlan as never)
    if (planId == null) throw new APIError('Version has no lesson plan', 409)

    // Field access (`canSetOfficialVersion`) + `validateOfficialVersionPointer` gate/validate this.
    await req.payload.update({
      collection: 'lesson-plans',
      id: planId,
      data: { officialVersion: version.id } as never,
      req,
      overrideAccess: false,
      user: req.user,
    })

    return json({ ok: true, officialVersion: version.id })
  },
}
