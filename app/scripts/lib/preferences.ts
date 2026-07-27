/**
 * Shared pieces of `scripts/clear-editor-collapse-prefs.ts` that a test must be able to reach. The
 * script itself boots Payload at import time (`await run()` at module scope), so it can never be
 * imported — same reason `stripCollapsed` lives here.
 *
 * Extracting the WRITE matters more than it looks: an earlier version of the int spec pasted the update
 * inline under "the exact statement the script runs", which meant the spec proved a *copy* was correct
 * while the script's real write had no cover at all. That is the very failure this whole area was fixing.
 */
import type { Payload } from 'payload'

/** Payload keys document preferences `collection-${slug}-${id}` (@payloadcms/ui DocumentInfo), so every
 *  version-editor preference starts with this. Imported by both the script and its spec so the filter
 *  under test and the filter asserted are the same string. */
export const PREFERENCE_KEY_PREFIX = 'collection-lesson-bundle-versions-'

/** A preference row as the script reads it (`depth: 0`), where `user` is the unpopulated relationship. */
export interface PreferenceRow {
  id: number | string
  user?: { relationTo: string; value: number | string | { id: number | string } } | null
}

/**
 * Overwrite one preference document's `value`.
 *
 * The wrinkle worth knowing: `payload-preferences.user` is `required: true` and carries a
 * `beforeValidate` field hook (payload/dist/preferences/config.js) that REPLACES whatever the caller
 * submits with `req.user` — or `null` when there is no authenticated request:
 *
 *     if (!req?.user) { return null }
 *     return { relationTo: req.user.collection, value: req.user.id }
 *
 * So passing `user` inside `data` cannot work; the hook discards it and the required check then fails
 * with "The following field is invalid: User". The fix is the Local API's top-level `user` OPTION, which
 * `createLocalReq` turns into `req.user` (`req.user = user || req?.user || null`) — the hook then
 * regenerates the same owner and validation passes. Acting AS the row's own owner also means the
 * relationship round-trips unchanged rather than being reassigned.
 */
export async function writePreferenceValue(
  payload: Payload,
  row: PreferenceRow,
  value: unknown,
): Promise<void> {
  const owner = row.user
  if (!owner) throw new Error(`preference ${row.id} has no owner — refusing to write`)
  const ownerId = typeof owner.value === 'object' ? owner.value.id : owner.value
  await payload.update({
    collection: 'payload-preferences',
    id: row.id,
    data: { value } as never,
    // The knob that makes this expressible at all — see above.
    user: { id: ownerId, collection: owner.relationTo } as never,
    overrideAccess: true,
  })
}
