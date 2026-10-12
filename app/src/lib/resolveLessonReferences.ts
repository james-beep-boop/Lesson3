/** Resolve a page's saved-version references in two batched, viewer-scoped reads. */
import type { Payload } from 'payload'
import type { User } from '../payload-types'
import type { ReferenceView } from './lessonReference'
import { distinctIds, relId } from './relId'

type Referencing = { refVersion?: unknown; refLabel?: string | null }

/**
 * Resolve every reference on a page at once, as the viewer: one read for the referenced versions, one for
 * their sources.
 *
 * ⚑ A NULL OR UNREADABLE `refVersion` GETS NO LINK AT ALL — not a lesson link (which would open the
 * Official version instead) and not Compare changes (GPT review 2026-10-09). The snapshot label still says
 * what it was.
 */
export async function resolveVersionReferences(
  payload: Payload,
  user: User,
  posts: Referencing[],
): Promise<(ReferenceView | null)[]> {
  const versionIds = distinctIds(posts.map((p) => relId(p.refVersion)))
  const readable = versionIds.length
    ? (
        await payload.find({
          collection: 'lesson-bundle-versions',
          where: { id: { in: versionIds } },
          overrideAccess: false,
          user,
          depth: 0,
          pagination: false,
          select: { lessonPlan: true, sourceVersion: true },
        })
      ).docs
    : []
  const byId = new Map(readable.map((v) => [v.id, v]))
  const sourceIds = distinctIds(readable.map((v) => relId(v.sourceVersion)))
  const readableSources = new Set(
    sourceIds.length
      ? (
          await payload.find({
            collection: 'lesson-bundle-versions',
            where: { id: { in: sourceIds } },
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            select: { semver: true }, // any one field: only the ids of what is readable matter
          })
        ).docs.map((v) => v.id)
      : [],
  )

  return posts.map((post) => {
    const versionId = relId(post.refVersion)
    if (versionId == null && !post.refLabel) return null
    const label = post.refLabel ?? 'A lesson version'
    const version = versionId == null ? undefined : byId.get(versionId)
    const planId = relId(version?.lessonPlan)
    if (!version || planId == null) return { label, lessonHref: null, compareHref: null }
    const sourceId = relId(version.sourceVersion)
    return {
      label,
      lessonHref: `/lessons/${planId}?version=${version.id}`,
      compareHref:
        sourceId != null && readableSources.has(sourceId)
          ? `/lessons/${planId}/compare?from=${sourceId}&to=${version.id}`
          : null,
    }
  })
}
