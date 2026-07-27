/**
 * Wire-level cover for `scripts/clear-editor-collapse-prefs.ts` — the operator script that clears
 * stored row-collapse state so `initCollapsed` can take effect (see
 * docs/DESIGN-editor-usability-2026-07-25.md §3c).
 *
 * WHY THIS EXISTS. The script shipped with a runbook that had never been executed, and its first real
 * run on the Rock failed. The interesting part is that the OBVIOUS fix was also wrong, twice over:
 *
 *   1. `{ value }`-only update → "The following field is invalid: User" (`user` is required).
 *   2. Resubmitting `doc.user` → the SAME error, because `payload-preferences.user` carries a
 *      `beforeValidate` field hook (payload/dist/preferences/config.js) that REPLACES whatever is
 *      submitted with `req.user`, or `null` when there is no authenticated request. A script has no
 *      `req.user`, so the hook nulls a required field no matter what the caller passes.
 *
 * Two review rounds accepted fix (2) on the strength of the GENERATED TYPE (`{ relationTo, value }`) —
 * which is the read shape and merely looks like a valid write shape. Nobody read the field's hooks. So
 * the script writes the jsonb column directly, and the first case below pins WHY, by asserting the
 * Local-API path still fails even with `user` supplied. That is the assertion that would have stopped
 * both dead ends.
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { createUserVerified, MARK } from '../helpers/fixtures.js'
import { drizzleOf } from '../helpers/db.js'
import { stripCollapsed } from '../../scripts/lib/stripCollapsed.js'

// Mirrors the real key shape (`collection-${slug}-${id}`) so the script's `like` filter would match it,
// but MARK-tagged so this run's row is unambiguous and teardown is precise.
const KEY = `collection-lesson-bundle-versions-${MARK}1`

const STORED = {
  fields: {
    lessons: { collapsed: ['row-a', 'row-b'] },
    'lessons.0.framework': { collapsed: [] }, // empty still suppresses initCollapsed — must be stripped
    'summaryTable.lessons': { someOtherPref: 42 }, // unrelated preference — must survive
  },
  editViewType: 'default', // top-level sibling key — must survive
}

let payload: Payload
let userId: number
let prefId: number

/** Read the row straight from the column — the Local API is not the thing under test here. */
const readValue = async (id: number): Promise<Record<string, unknown>> => {
  const res = (await drizzleOf(payload).execute(
    sql`SELECT "value" FROM "payload_preferences" WHERE "id" = ${id};`,
  )) as { rows: { value: Record<string, unknown> }[] }
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
  // Seeded with raw SQL for the same reason the script writes that way: the `user` beforeValidate hook
  // makes a scripted Local-API create impossible (that is finding #2 above, and it is asserted below).
  const inserted = (await drizzleOf(payload).execute(
    sql`INSERT INTO "payload_preferences" ("key", "value") VALUES (${KEY}, ${JSON.stringify(STORED)}::jsonb) RETURNING "id";`,
  )) as { rows: { id: number }[] }
  prefId = inserted.rows[0]!.id
  await drizzleOf(payload).execute(
    sql`INSERT INTO "payload_preferences_rels" ("parent_id", "path", "users_id") VALUES (${prefId}, 'user', ${userId});`,
  )
})

afterAll(async () => {
  await drizzleOf(payload)
    .execute(sql`DELETE FROM "payload_preferences" WHERE "id" = ${prefId};`)
    .catch(() => {})
  await payload.delete({ collection: 'users', id: userId, overrideAccess: true }).catch(() => {})
})

describe('clear-editor-collapse-prefs', () => {
  it('CANNOT be done through the Local API — even resubmitting `user` (the dead end)', async () => {
    // Pins the reason for the raw write. The `beforeValidate` hook discards the submitted `user` and
    // substitutes null (no `req.user` in a script), so `required: true` fails either way.
    const { value } = stripCollapsed(STORED)
    await expect(
      payload.update({
        collection: 'payload-preferences',
        id: prefId,
        data: { value, user: { relationTo: 'users', value: userId } } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/User/i)
  })

  it('strips ONLY the collapse state, preserving every other preference', async () => {
    const found = await payload.find({
      collection: 'payload-preferences',
      where: { key: { like: KEY_PREFIX_OF(KEY) } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    const doc = found.docs.find((d) => d.key === KEY)
    expect(doc, 'the seeded preference must be findable by the script’s own query').toBeTruthy()

    const { value, stripped } = stripCollapsed(doc!.value)
    expect(stripped.sort()).toEqual(['lessons', 'lessons.0.framework'])

    // The exact statement the script runs.
    await drizzleOf(payload).execute(
      sql`UPDATE "payload_preferences" SET "value" = ${JSON.stringify(value)}::jsonb WHERE "id" = ${prefId};`,
    )

    const after = (await readValue(prefId)) as {
      fields?: Record<string, Record<string, unknown>>
      editViewType?: string
    }
    // Collapse state gone → `isRowCollapsed` falls through to `initCollapsed`, which is the whole point.
    expect(after.fields?.lessons).not.toHaveProperty('collapsed')
    expect(after.fields?.['lessons.0.framework']).not.toHaveProperty('collapsed')
    // Everything else preserved — surgical, not a wipe.
    expect(after.fields?.['summaryTable.lessons']).toEqual({ someOtherPref: 42 })
    expect(after.editViewType).toBe('default')
  })

  it('leaves the owning `user` relationship intact', async () => {
    // The relationship lives in a separate table, so a jsonb column write must not disturb it — if it
    // did, the preference would be orphaned and Payload would stop honouring it for that user.
    const rels = (await drizzleOf(payload).execute(
      sql`SELECT "users_id" FROM "payload_preferences_rels" WHERE "parent_id" = ${prefId} AND "path" = 'user';`,
    )) as { rows: { users_id: number }[] }
    expect(rels.rows.map((r) => r.users_id)).toEqual([userId])
  })

  it('is idempotent — a second pass finds nothing left to strip', async () => {
    const { stripped } = stripCollapsed(await readValue(prefId))
    expect(stripped).toEqual([])
  })
})

/** The script filters on this prefix; deriving it from the key keeps the test honest about the query. */
function KEY_PREFIX_OF(key: string): string {
  return key.slice(0, key.indexOf(MARK))
}
