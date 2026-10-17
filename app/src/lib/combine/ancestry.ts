/**
 * The common ancestor of two versions, for Combine versions (SPEC §6).
 *
 * ⚑ PHASE 2 WALKS `sourceVersion`, AND THAT LINK IS LOSSY. It is `ON DELETE SET NULL`, and versions are
 * deleted in normal use (save's "delete the version you opened", Make Official's "delete the
 * previous"), so a chain can end before it reaches the true ancestor. That is SAFE, only less
 * automatic: no common ancestor means the engine treats every difference as a person's choice. Phase 3
 * adds a delete-proof lineage record so the nearest SURVIVING ancestor can be found past a gap.
 *
 * Nearest wins: the first version on `b`'s chain that is also on `a`'s chain. With single-parent
 * chains every common ancestor lies above the nearest one, so the first hit is the right one. Either
 * version may itself be the ancestor of the other (combining 1.0.2 with its own parent 1.0.1).
 */
import type { PayloadRequest } from 'payload'

import type { LessonBundleVersion, User } from '../../payload-types'
import { findReadableVersion } from '../readBundle'
import { relId } from '../relId'

/** A chain longer than this is treated as having no ancestor rather than walked further. */
export const MAX_CHAIN = 500

async function chainOf(
  req: PayloadRequest,
  user: User,
  version: LessonBundleVersion,
): Promise<number[]> {
  const ids = [version.id]
  const seen = new Set(ids)
  let parent = relId(version.sourceVersion)
  while (parent !== null && ids.length < MAX_CHAIN && !seen.has(parent)) {
    ids.push(parent)
    seen.add(parent)
    const doc = await req.payload
      .findByID({
        collection: 'lesson-bundle-versions',
        id: parent,
        depth: 0,
        select: { sourceVersion: true },
        overrideAccess: false,
        user,
        req,
      })
      .catch(() => null)
    parent = doc ? relId((doc as { sourceVersion?: unknown }).sourceVersion) : null
  }
  return ids
}

/** The nearest common ancestor of `a` and `b` (either may be it), or null when none is reachable. */
export async function findCommonAncestor(
  req: PayloadRequest,
  user: User,
  a: LessonBundleVersion,
  b: LessonBundleVersion,
): Promise<LessonBundleVersion | null> {
  const [chainA, chainB] = await Promise.all([chainOf(req, user, a), chainOf(req, user, b)])
  const onA = new Set(chainA)
  const id = chainB.find((x) => onA.has(x))
  if (id === undefined) return null
  if (id === a.id) return a
  if (id === b.id) return b
  return findReadableVersion(req.payload, { id: String(id), user, req })
}
