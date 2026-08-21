/**
 * Provenance on assignment rows (`grantedBy` / `grantedAt`, 2026-08-19).
 *
 * ⚑ THIS SPEC EXISTS BECAUSE THE MECHANISM IS NOT OBVIOUSLY SOUND. The two fields are declared with
 * `access: { create: () => false, update: () => false }` so no client can forge them, and they are
 * written by a collection `beforeChange` hook. Whether a hook-set value SURVIVES field access depends
 * on the order Payload applies the two, which is a framework detail — and the failure mode is silent:
 * the write succeeds and the columns are null, which is indistinguishable from a legacy row. So it is
 * asserted against a real database rather than reasoned about.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  MARK,
  createUserVerified,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'

let fx: RoleFixture

/**
 * ⚑ THROUGH THE HOUSE HELPER, which owns `disableVerificationEmail`. These two specs hand-rolled the
 * create until 2026-08-20 and the run said so out loud — "Email attempted without being configured.
 * To: 'zz_int_…prov-new@example.com'" — which is precisely the relay bounce that would fail the create
 * itself against a configured transport.
 */
const makeUser = (slug: string) =>
  createUserVerified(fx.payload, {
    email: `${MARK.toLowerCase()}${slug}@example.com`,
    name: `${MARK}${slug}`,
    password: fx.password,
  })

const assignmentsOf = async (userId: number) => {
  const doc = await fx.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })
  return (doc.assignments ?? []) as {
    subjectGrade: number
    role: string
    grantedBy?: number | null
    grantedAt?: string | null
  }[]
}

beforeAll(async () => {
  fx = await setupRoleFixture()
})
afterAll(async () => {
  await fx?.teardown()
})

describe('assignment provenance', () => {
  it('stamps grantedBy and grantedAt on a NEW row, written by the hook past field access', async () => {
    const target = await makeUser('prov-new')

    await fx.payload.update({
      collection: 'users',
      id: target.id,
      data: { assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }] },
      overrideAccess: true,
      user: fx.users.siteAdmin,
    })

    const rows = await assignmentsOf(target.id)
    expect(rows).toHaveLength(1)
    // ⚑ The whole point: a hook-set value on a field the client may not write must still reach the DB.
    expect(rows[0]!.grantedBy).toBe(fx.users.siteAdmin.id)
    expect(rows[0]!.grantedAt).toBeTruthy()
  })

  it('does not restamp an unchanged row — grantedAt is the grant, not the last save', async () => {
    const target = await makeUser('prov-stable')
    await fx.payload.update({
      collection: 'users',
      id: target.id,
      data: { assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }] },
      overrideAccess: true,
      user: fx.users.siteAdmin,
    })
    const first = (await assignmentsOf(target.id))[0]!

    // An unrelated save of the same user, carrying the same assignment row.
    await fx.payload.update({
      collection: 'users',
      id: target.id,
      data: {
        name: `${MARK}Provenance renamed`,
        assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }],
      },
      overrideAccess: true,
      user: fx.users.subjectAdmin,
    })
    const second = (await assignmentsOf(target.id))[0]!

    // Same grantor, same instant: the row did not change, so its provenance must not either — and in
    // particular it must NOT now name the person who merely renamed the account.
    expect(second.grantedBy).toBe(first.grantedBy)
    expect(second.grantedAt).toBe(first.grantedAt)
  })

  // ⚑ THIS PINS A PERFORMANCE PROPERTY, which is unusual, and it is here because the failure mode is
  // invisible: `grantedBy` is a SELF-REFERENTIAL relationship on a field inside `req.user`, and the JWT
  // strategy loads that on every authenticated request at `collection.auth.depth` — which Payload never
  // defaults, so `afterRead` falls back to `config.defaultDepth`, 2. Uncapped, every request would
  // fetch the grantor, and then the grantor's own grantor. Nothing would break; the app would just be
  // permanently slower, and a comment is the only thing that would have said so.
  it('never populates grantedBy — the maxDepth 0 cap holds at the depth req.user is loaded with', async () => {
    const target = await makeUser('prov-depth')
    await fx.payload.update({
      collection: 'users',
      id: target.id,
      data: { assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }] },
      overrideAccess: true,
      user: fx.users.siteAdmin,
    })

    const doc = await fx.payload.findByID({
      collection: 'users',
      id: target.id,
      depth: 2,
      overrideAccess: true,
    })
    const row = (doc.assignments ?? [])[0]!
    expect(typeof row.grantedBy).toBe('number')

    // ⚑ AND THE SIBLING PROVES THE ASSERTION CAN FAIL. `subjectGrade` sits in the same array with no
    // cap, so at this depth it IS an object. Without this line the test would also pass if the query
    // had stopped populating anything at all — a vacuous assertion dressed as a guard.
    expect(typeof row.subjectGrade).toBe('object')
  })
})
