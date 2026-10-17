/**
 * GET /api/lesson-bundle-versions/:id/combine-preview?with=:otherId — Combine versions, the READ-ONLY
 * half (SPEC §6, phase 2). Works out what combining the two versions would produce; writes nothing.
 *
 * The combined version is saved later through the unchanged `save-as-new` from the version the plan
 * names as its starting point (phase 3), so this endpoint grants nothing a save would not re-check.
 *
 * | Case                                              | Status |
 * |---------------------------------------------------|--------|
 * | not signed in                                     | 401    |
 * | over the per-user `preview` rate limit            | 429    |
 * | `with` missing, malformed, or the same version    | 400    |
 * | either version not found / not readable           | 404    |
 * | the two versions belong to different plans        | 400    |
 * | caller has no editing access for the subject-grade| 403    |
 * | otherwise                                         | 200    |
 *
 * 403 rather than 404 for the role check, matching `save-as-new`: every signed-in user may read a
 * version, so its existence is not the secret — the caller is told they may not combine. Operator
 * decision 2026-10-17: a Teacher with editing access may combine (prose only; making the result
 * Official stays an administrator's action).
 *
 * A refused combine (different structure, administrator content changed on both sides, different
 * uploads) is a 200 with `plan.ok: false` and a message — the request was fine; the versions just
 * cannot be combined automatically, and the person needs to be told why.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isEditorFor, toId } from '../access'
import { findCommonAncestor } from '../lib/combine/ancestry'
import { planCombine } from '../lib/combine/engine'
import { enforceUserRateLimit } from '../lib/rateLimit'
import { findReadableVersion } from '../lib/readBundle'
import { relId } from '../lib/relId'
import type { LessonBundleVersion, User } from '../payload-types'
import { json } from './respond'

const label = (v: LessonBundleVersion) => ({ id: v.id, semver: v.semver ?? null })

export const combinePreviewEndpoint: Endpoint = {
  path: '/:id/combine-preview',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const user = req.user as User
    // Shares the preview admission bucket; planCombine separately bounds synchronous work across
    // the entire document. A request rate alone cannot bound the cost of one admitted preview.
    const limited = await enforceUserRateLimit(req, 'preview')
    if (limited) return limited

    // `relId` is the project's id rule (digits, within Postgres integer range), so an out-of-range id
    // is a 400 here rather than a database error.
    const id = relId(req.routeParams?.id)
    const withId = relId(req.query?.with)
    if (id === null || withId === null) throw new APIError('Choose two versions to combine.', 400)
    if (id === withId) throw new APIError('Choose a different version to combine with.', 400)

    const [a, b] = await Promise.all([
      findReadableVersion(req.payload, { id, user, req }),
      findReadableVersion(req.payload, { id: withId, user, req }),
    ])
    if (!a || !b) throw new APIError('Version not found', 404)
    const planId = relId(a.lessonPlan)
    if (planId === null || planId !== relId(b.lessonPlan)) {
      throw new APIError('Both versions must belong to the same lesson plan.', 400)
    }
    if (!isEditorFor(user, toId(a.subjectGrade))) {
      throw new APIError('Only someone with editing access can combine versions.', 403)
    }

    const base = await findCommonAncestor(req, user, a, b)
    const plan = planCombine({ base, a, b })
    return json({ a: label(a), b: label(b), base: base ? label(base) : null, plan })
  },
}
