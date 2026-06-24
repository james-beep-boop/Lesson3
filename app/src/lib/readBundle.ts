import type { Payload, PayloadRequest } from 'payload'

import type { LessonBundle, LessonBundleVersion, LessonPlan, User } from '@/payload-types'

/**
 * findByID for a lesson bundle with the CALLER's access (overrideAccess:false + user).
 *
 * Returns null ONLY for the expected "not visible to this user" cases — Payload throws 404
 * (not found, or the access query filtered the row out) or 403 (read denied). Any OTHER error
 * (DB unreachable, unexpected runtime failure) PROPAGATES, so real operational failures surface
 * as real errors (500) instead of being silently masked as a 404. Callers turn null into their
 * own 404 (an APIError, or Next's notFound()).
 */
export async function findReadableBundle(
  payload: Payload,
  args: {
    id: string | number
    user: User | null
    depth?: number
    req?: PayloadRequest
    draft?: boolean
  },
): Promise<LessonBundle | null> {
  try {
    return (await payload.findByID({
      collection: 'lesson-bundles',
      id: args.id,
      depth: args.depth ?? 0,
      // `draft: true` reads the latest (draft) snapshot — for the editor preview. The read
      // access rule (`lessonBundleRead`) still applies, so a Teacher can't pull an
      // unpublished draft this way (they only match `_status: published`).
      draft: args.draft ?? false,
      overrideAccess: false,
      user: args.user,
      req: args.req,
    })) as LessonBundle
  } catch (e) {
    const status = (e as { status?: number } | null | undefined)?.status
    if (status === 404 || status === 403) return null
    throw e
  }
}

/** Turn an access 404/403 into null (the "not visible to this user" cases); rethrow real errors. */
function nullOnNotVisible(e: unknown): null {
  const status = (e as { status?: number } | null | undefined)?.status
  if (status === 404 || status === 403) return null
  throw e
}

/**
 * findByID for a LessonPlan with the CALLER's access (overrideAccess:false + user). Returns null
 * only for the expected not-visible cases (404/403); real errors propagate. The new-model
 * counterpart to `findReadableBundle` — see its doc for the null-vs-throw contract.
 */
export async function findReadablePlan(
  payload: Payload,
  args: { id: string | number; user: User | null; depth?: number; req?: PayloadRequest },
): Promise<LessonPlan | null> {
  try {
    return (await payload.findByID({
      collection: 'lesson-plans',
      id: args.id,
      depth: args.depth ?? 0,
      overrideAccess: false,
      user: args.user,
      req: args.req,
    })) as LessonPlan
  } catch (e) {
    return nullOnNotVisible(e)
  }
}

/**
 * findByID for an immutable LessonBundleVersion with the CALLER's access (overrideAccess:false +
 * user). Returns null only for not-visible cases (404/403). There is no draft/published axis on
 * versions — every retained version is a valid snapshot — so this has no `draft` flag.
 */
export async function findReadableVersion(
  payload: Payload,
  args: { id: string | number; user: User | null; depth?: number; req?: PayloadRequest },
): Promise<LessonBundleVersion | null> {
  try {
    return (await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: args.id,
      depth: args.depth ?? 0,
      overrideAccess: false,
      user: args.user,
      req: args.req,
    })) as LessonBundleVersion
  } catch (e) {
    return nullOnNotVisible(e)
  }
}
