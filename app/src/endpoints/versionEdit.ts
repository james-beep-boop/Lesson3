/**
 * Working-copy edit endpoints (SPEC §6, Stage 2b), mounted on `lesson-bundle-versions`:
 *
 *   - POST /:id/fork           — create a Not-Official working copy from this version (content copy,
 *                                semver patch-bump, `sourceVersion` set) and return its admin URL.
 *   - POST /:id/make-official  — point this version's plan at it (move `officialVersion`; no content
 *                                copy). The version then becomes immutable (enforceVersionImmutable).
 *
 * AUTHORIZATION is enforced HERE (both are state-changing POSTs, CSRF-guarded by the SameSite=Lax
 * cookie). Editing is admin-scoped for now: a caller must be Subject Admin for the version's
 * subject-grade (or Site Admin). Editor prose-editing arrives once the field-split is factored out
 * of `enforceBundleStructure`. A non-admin gets 403.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isSubjectAdminFor, toId } from '../access'
import { bumpSemver } from '../lib/semver'
import { findReadableVersion } from '../lib/readBundle'
import type { LessonBundleVersion, User } from '../payload-types'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Content keys NOT carried into a forked copy (identity/version metadata + Payload internals). */
const DROP_KEYS = new Set(['id', 'semver', 'sourceVersion', 'createdAt', 'updatedAt'])

/** Deep-clone, dropping every nested `id` (array-row ids belong to the source rows, not the copy). */
const stripIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripIds)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'id') continue
      out[k] = stripIds(v)
    }
    return out
  }
  return value
}

/** Load the version with the caller's READ access, then require Subject/Site Admin for its grade. */
async function authorizeAdminEdit(req: PayloadRequest): Promise<LessonBundleVersion> {
  if (!req.user) throw new APIError('Unauthorized', 401)
  const id = req.routeParams?.id as string | undefined
  if (!id) throw new APIError('Missing version id', 400)

  const version = await findReadableVersion(req.payload, { id, user: req.user as User, req })
  if (!version) throw new APIError('Version not found', 404)
  if (!isSubjectAdminFor(req.user as User, toId(version.subjectGrade as never))) {
    throw new APIError('Not allowed', 403)
  }
  return version
}

/** POST /:id/fork — create a Not-Official working copy and return its admin URL. */
export const forkVersionEndpoint: Endpoint = {
  path: '/:id/fork',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const source = await authorizeAdminEdit(req)

    const content = stripIds(
      Object.fromEntries(
        Object.entries(source as unknown as Record<string, unknown>).filter(([k]) => !DROP_KEYS.has(k)),
      ),
    ) as Record<string, unknown>

    const working = await req.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...content,
        lessonPlan: toId(source.lessonPlan as never),
        subjectGrade: toId(source.subjectGrade as never),
        semver: bumpSemver(source.semver, 'patch'),
        sourceVersion: source.id,
      } as never,
      req,
      overrideAccess: false,
      user: req.user,
    })

    return json({
      id: working.id,
      adminUrl: `/admin/collections/lesson-bundle-versions/${working.id}`,
    })
  },
}

/** POST /:id/make-official — move this version's plan pointer to it (no content copy). */
export const makeOfficialEndpoint: Endpoint = {
  path: '/:id/make-official',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const version = await authorizeAdminEdit(req)
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
