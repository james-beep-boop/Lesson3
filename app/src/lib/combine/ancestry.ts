/** Delete-proof ancestry for Combine versions (SPEC §6). */
import type { PayloadRequest } from 'payload'

import type { LessonBundleVersion, User } from '../../payload-types'
import { findReadableVersion } from '../readBundle'
import { relId } from '../relId'
import { compareSemver } from '../semver'
import { MAX_LINEAGE } from './lineage'

/** Numeric version first; timestamp and id make the ordering deterministic even for damaged data. */
export function newestAncestor<T extends { id: number; semver?: string | null; createdAt: string }>(
  versions: T[],
): T | null {
  return versions.reduce<T | null>((best, candidate) => {
    if (!best) return candidate
    const order =
      compareSemver(candidate.semver ?? '0.0.0', best.semver ?? '0.0.0') ||
      Date.parse(candidate.createdAt) - Date.parse(best.createdAt) ||
      candidate.id - best.id
    return order > 0 ? candidate : best
  }, null)
}

export async function findCommonAncestor(
  req: PayloadRequest,
  user: User,
  a: LessonBundleVersion,
  b: LessonBundleVersion,
): Promise<LessonBundleVersion | null> {
  // A full window may have lost ancestors. A retained overlap alone does not prove that it is
  // the newest common ancestor, especially after both-parent combines. Use safe two-way comparison
  // rather than silently selecting an older base. Exact-cap histories are conservative too.
  if ((a.lineage?.length ?? 0) >= MAX_LINEAGE || (b.lineage?.length ?? 0) >= MAX_LINEAGE)
    return null
  const onA = new Set([a.id, ...(a.lineage ?? [])])
  const common = [b.id, ...(b.lineage ?? [])].filter((id) => onA.has(id))
  if (!common.length) return null
  const { docs } = await req.payload.find({
    collection: 'lesson-bundle-versions',
    where: { and: [{ id: { in: common } }, { lessonPlan: { equals: relId(a.lessonPlan) } }] },
    depth: 0,
    pagination: false,
    select: { semver: true, createdAt: true },
    overrideAccess: false,
    user,
    req,
  })
  const newest = newestAncestor(docs)
  if (!newest) return null
  // A deleted candidate is absent from the query; a concurrent deletion here is handled by the
  // existing readable-version seam. Other database failures must still propagate.
  return findReadableVersion(req.payload, { id: newest.id, user, req })
}
