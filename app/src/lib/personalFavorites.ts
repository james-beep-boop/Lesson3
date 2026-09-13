import type { Payload, Where } from 'payload'

import type { User } from '../payload-types'

/** Personal stars, not the administrative collection view (Site Admins can read all rows there). */
export function findPersonalFavorites(
  payload: Payload,
  { user, versionId }: { user: User; versionId?: number },
) {
  const owner: Where = { user: { equals: user.id } }
  return payload.find({
    collection: 'favorites',
    where: versionId == null ? owner : { and: [owner, { version: { equals: versionId } }] },
    overrideAccess: false,
    user,
    depth: 0,
    ...(versionId == null ? { pagination: false } : { limit: 1 }),
    select: { version: true },
  })
}
