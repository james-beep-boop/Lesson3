import type { Payload } from 'payload'
import type { User } from '../payload-types'
import { findReadableVersion, nullOnNotVisible } from './readBundle'
import { relId } from './relId'

/** Only display values cross into the lesson page; related records keep the caller's access. */
export async function readLessonDetails(
  payload: Payload,
  args: {
    versionId: number
    user: User
    versions: readonly { id: number; semver?: string | null }[]
  },
) {
  const version = await findReadableVersion(payload, {
    id: args.versionId,
    user: args.user,
    select: { author: true, sourceVersion: true, createdAt: true, updatedAt: true },
  })
  if (!version) return null

  const authorId = relId(version.author)
  let savedBy = 'Not recorded'
  if (authorId != null) {
    const author = await payload
      .findByID({
        collection: 'users',
        id: authorId,
        user: args.user,
        overrideAccess: false,
        depth: 0,
        select: { name: true },
      })
      .catch(nullOnNotVisible)
    savedBy = author?.name?.trim() || 'Unavailable'
  }

  // Resolve only within this plan's already access-gated version list. A removed/unreadable
  // source must never turn into a different version or reveal a record through an override read.
  const sourceId = relId(version.sourceVersion)
  const source = args.versions.find((v) => v.id === sourceId)
  return {
    savedBy,
    basedOn: sourceId == null ? 'Not recorded' : source?.semver || 'Unavailable',
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }
}
