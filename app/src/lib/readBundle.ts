import type { Payload, PayloadRequest } from 'payload'

import type { LessonBundle, User } from '@/payload-types'

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
  args: { id: string | number; user: User | null; depth?: number; req?: PayloadRequest },
): Promise<LessonBundle | null> {
  try {
    return (await payload.findByID({
      collection: 'lesson-bundles',
      id: args.id,
      depth: args.depth ?? 0,
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
