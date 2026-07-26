/**
 * Wire-level cover for `scripts/clear-editor-collapse-prefs.ts` — the operator script that clears
 * stored row-collapse state so `initCollapsed` can take effect (see
 * docs/DESIGN-editor-usability-2026-07-25.md §3c).
 *
 * WHY THIS EXISTS. The script shipped with a documented runbook that had never been executed, and its
 * first real run on the Rock (2026-07-26) failed outright: `payload-preferences.user` is a REQUIRED
 * polymorphic relationship living in `payload_preferences_rels`, not a column on the row, and Payload
 * validates the whole document on update — so the script's `{ value }`-only patch died with
 * "The following field is invalid: User". Nothing was written, but production was the first end-to-end
 * test of an operational repair, which is exactly what this file prevents from recurring.
 *
 * The pure transform is unit-tested in `tests/unit/stripCollapsed.spec.ts`; what could only fail at the
 * wire is the UPDATE, so that is what this exercises — including a negative case asserting the
 * unfixed shape still fails (CLAUDE.md: a test for a failure must be run against the unfixed code).
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { createUserVerified, MARK } from '../helpers/fixtures.js'
import { stripCollapsed } from '../../scripts/lib/stripCollapsed.js'

// Mirrors the real key shape (`collection-${slug}-${id}`) so the script's `like` filter would match it,
// but with a MARK-tagged suffix so this run's rows are unambiguous and teardown is precise.
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
let prefId: number | string

beforeAll(async () => {
  payload = await getPayload({ config })
  const user = await createUserVerified(payload, {
    email: `${MARK}prefs@example.com`,
    name: `${MARK}Prefs Owner`,
    password: `pw-${MARK}-Str0ng!`,
  })
  userId = user.id as number
  const created = await payload.create({
    collection: 'payload-preferences',
    data: { key: KEY, value: STORED, user: { relationTo: 'users', value: userId } } as never,
    overrideAccess: true,
  })
  prefId = created.id
})

afterAll(async () => {
  await payload.delete({ collection: 'payload-preferences', id: prefId, overrideAccess: true }).catch(() => {})
  await payload.delete({ collection: 'users', id: userId, overrideAccess: true }).catch(() => {})
})

describe('clear-editor-collapse-prefs: the UPDATE the script performs', () => {
  it('REJECTS a `{ value }`-only patch — the shape that failed in production', async () => {
    // Pins the defect, not just the fix: `user` is required and Payload re-validates the whole doc.
    const { value } = stripCollapsed(STORED)
    await expect(
      payload.update({
        collection: 'payload-preferences',
        id: prefId,
        data: { value } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/User/i)
  })

  it('succeeds when `user` is resubmitted, and strips ONLY the collapse state', async () => {
    // Exactly what the script does: find at depth 0 (which yields `user` already in the
    // `{ relationTo, value }` write shape), transform, then update with both fields.
    const found = await payload.findByID({
      collection: 'payload-preferences',
      id: prefId,
      depth: 0,
      overrideAccess: true,
    })
    const { value, stripped } = stripCollapsed(found.value)
    expect(stripped.sort()).toEqual(['lessons', 'lessons.0.framework'])

    const updated = await payload.update({
      collection: 'payload-preferences',
      id: prefId,
      data: { value, user: found.user } as never,
      overrideAccess: true,
    })

    const after = (updated.value ?? {}) as {
      fields?: Record<string, Record<string, unknown>>
      editViewType?: string
    }
    // Collapse state gone → `isRowCollapsed` falls through to `initCollapsed`, which is the whole point.
    expect(after.fields?.lessons).not.toHaveProperty('collapsed')
    expect(after.fields?.['lessons.0.framework']).not.toHaveProperty('collapsed')
    // Everything else preserved — this is a surgical edit, not a wipe.
    expect(after.fields?.['summaryTable.lessons']).toEqual({ someOtherPref: 42 })
    expect(after.editViewType).toBe('default')
    // The owner relationship survives the round-trip.
    expect(updated.user).toBeTruthy()
  })

  it('is idempotent — a second pass finds nothing left to strip', async () => {
    const found = await payload.findByID({
      collection: 'payload-preferences',
      id: prefId,
      depth: 0,
      overrideAccess: true,
    })
    const { stripped } = stripCollapsed(found.value)
    expect(stripped).toEqual([])
  })
})
