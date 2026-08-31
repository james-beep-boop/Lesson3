/**
 * Wire-level cover for `scripts/clear-editor-collapse-prefs.ts` — the operator script that clears stored
 * row-collapse state so `initCollapsed` can take effect (docs/DESIGN-editor-usability-2026-07-25.md §3c).
 *
 * It exercises the script's REAL write (`scripts/lib/preferences.ts#writePreferenceValue`), not a copy of
 * it. The subtlety being pinned: `payload-preferences.user` is `required: true` and its `beforeValidate`
 * hook replaces any submitted `user` with `req.user`, so putting `user` in `data` can never work — but
 * the Local API's top-level `user` OPTION does, because `createLocalReq` turns it into `req.user`. The
 * first case asserts both halves, since asserting only the first half is what previously produced a
 * green test claiming a platform limitation that does not exist (post-mortem: DECISIONS 2026-07-27).
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { createUserVerified, deleteUserFixture, MARK } from '../helpers/fixtures.js'
import { drizzleOf } from '../helpers/db.js'
import { PREFERENCE_KEY_PREFIX, writePreferenceValue } from '../../scripts/lib/preferences.js'
import { stripCollapsed } from '../../scripts/lib/stripCollapsed.js'

// The script's own prefix, imported rather than retyped, so the filter asserted here is the filter under
// test. MARK-tagged so this run's row is unambiguous and teardown is precise.
const KEY = `${PREFERENCE_KEY_PREFIX}${MARK}1`

const STORED = {
  fields: {
    lessons: { collapsed: ['row-a', 'row-b'] },
    'lessons.0.framework': { collapsed: [] }, // empty still suppresses initCollapsed — must be stripped
    'summaryTable.lessons': { someOtherPref: 42 }, // unrelated preference — must survive
  },
  editViewType: 'default', // top-level sibling key — must survive
}

type PrefValue = { fields?: Record<string, Record<string, unknown>>; editViewType?: string }

let payload: Payload
let userId: number
let prefId: number

/** Read the row straight from the column — the Local API is not the thing under test here. */
const readValue = async (id: number): Promise<PrefValue> => {
  const res = (await drizzleOf(payload).execute(
    sql`SELECT "value" FROM "payload_preferences" WHERE "id" = ${id};`,
  )) as { rows: { value: PrefValue }[] }
  return res.rows[0]!.value
}

beforeAll(async () => {
  payload = await getPayload({ config })
  const user = await createUserVerified(payload, {
    email: `${MARK}prefs@example.com`,
    name: `${MARK}Prefs Owner`,
    password: `pw-${MARK}-Str0ng!`,
  })
  userId = user.id as number
  // Seeded through the Local API with the same top-level `user` option the script relies on, so the
  // fixture exercises the mechanism instead of working around it and Payload owns the rels row. (An
  // earlier version seeded with raw SQL, claiming a scripted create was impossible — repeating the very
  // false limitation this spec exists to disprove. `create` uses the same `createLocalReq` as `update`.)
  const created = await payload.create({
    collection: 'payload-preferences',
    data: { key: KEY, value: STORED } as never,
    user: { id: userId, collection: 'users' } as never,
    overrideAccess: true,
  })
  prefId = created.id as number
})

afterAll(async () => {
  await drizzleOf(payload).execute(sql`DELETE FROM "payload_preferences" WHERE "id" = ${prefId};`)
  await deleteUserFixture(payload, userId)
})

describe('clear-editor-collapse-prefs', () => {
  it('`user` in `data` is rejected, but the top-level `user` OPTION works', async () => {
    // Half one — the dead end. The hook discards `data.user` and the required check fails.
    await expect(
      payload.update({
        collection: 'payload-preferences',
        id: prefId,
        data: { value: STORED, user: { relationTo: 'users', value: userId } } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/User/i)

    // Half two — the actual mechanism, and the assertion whose absence let a false claim ship. Writing
    // STORED back unchanged keeps the later cases' starting state intact.
    await expect(
      payload.update({
        collection: 'payload-preferences',
        id: prefId,
        data: { value: STORED } as never,
        user: { id: userId, collection: 'users' } as never,
        overrideAccess: true,
      }),
    ).resolves.toBeTruthy()
  })

  it('strips ONLY the collapse state, preserving every other preference', async () => {
    // Re-runs the script's own query shape, then its real write.
    const found = await payload.find({
      collection: 'payload-preferences',
      where: { key: { like: PREFERENCE_KEY_PREFIX } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    const doc = found.docs.find((d) => d.key === KEY)
    expect(doc, 'the seeded preference must be findable by the script’s own filter').toBeTruthy()

    const { value } = stripCollapsed(doc!.value)
    await writePreferenceValue(payload, doc!, value)

    const after = await readValue(prefId)
    // Collapse state gone → `isRowCollapsed` falls through to `initCollapsed`, which is the whole point.
    expect(after.fields?.lessons).not.toHaveProperty('collapsed')
    expect(after.fields?.['lessons.0.framework']).not.toHaveProperty('collapsed')
    // Everything else preserved — surgical, not a wipe. (The transform itself is unit-tested; these
    // assertions prove it survives the jsonb round-trip.)
    expect(after.fields?.['summaryTable.lessons']).toEqual({ someOtherPref: 42 })
    expect(after.editViewType).toBe('default')
    // Nothing left to strip — the "safe to re-run" promise in the script's header.
    expect(stripCollapsed(after).stripped).toEqual([])
  })

  it('leaves the owning `user` relationship intact', async () => {
    // Relies on the write in the previous case. The owner lives in a separate table, and the update acts
    // AS that owner — if it were reassigned or dropped, Payload would stop honouring the preference.
    const rels = (await drizzleOf(payload).execute(
      sql`SELECT "users_id" FROM "payload_preferences_rels" WHERE "parent_id" = ${prefId} AND "path" = 'user';`,
    )) as { rows: { users_id: number }[] }
    expect(rels.rows.map((r) => r.users_id)).toEqual([userId])
  })
})
