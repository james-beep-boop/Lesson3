/**
 * Provenance on assignment rows (`grantedBy` / `grantedAt`, 2026-08-19).
 *
 * ⚑ THIS SPEC EXISTS BECAUSE THE MECHANISM IS NOT OBVIOUSLY SOUND. The two fields are declared with
 * `access: { create: () => false, update: () => false }` so no client can forge them, and they are
 * written by a collection `beforeChange` hook. The failure mode is silent: the write succeeds and the
 * columns are null, which is indistinguishable from a legacy row. So it is asserted against a real
 * database rather than reasoned about.
 *
 * ⚑ TWO GUARDS, EACH INDEPENDENTLY SUFFICIENT — MEASURED 2026-08-21, and the measurement is the point.
 * Two earlier versions of this paragraph guessed at the mechanism and both guessed wrong, so here is
 * what three mutation runs actually show:
 *
 *   - Make both field-access predicates `() => true`, leave the hook alone → all cases still pass. The
 *     hook assigns both keys on EVERY row (new or carried forward), so a forged value that reaches
 *     `data` is overwritten anyway.
 *   - Leave field access alone, make the hook prefer a client-supplied value (`row.grantedBy ??
 *     actorId`) → all cases still pass. Field access has already stripped the keys from `data`, so the
 *     hook never sees them.
 *   - Remove BOTH → the forged grantor lands and the first case fails (`expected 143 to be 139`).
 *
 * So this is real defence-in-depth rather than one guard with a decorative second: either mechanism
 * alone stops forged provenance, which is why neither single mutation can fail a test. It also means no
 * test here can attribute the refusal to field access specifically — the honest claim is the OUTCOME,
 * which is what the assertions below are worded for: a caller writing through the ordinary path with
 * `overrideAccess: false` cannot get a self-appointed grantor or an invented timestamp into the
 * database, and it takes the loss of both guards for that to change.
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
  /**
   * ⚑ `overrideAccess: false`, AND FORGED VALUES IN THE INPUT — both added 2026-08-21 (review of PR
   * #258). The old shape wrote with `overrideAccess: true`, which bypasses access control entirely, so
   * the write never travelled the path a real caller travels. Now it does, as a Site Administrator, and
   * it carries a self-appointment ("granted to me, by me") plus an ancient timestamp — so each
   * assertion below has a WRONG value it must not equal, not merely a right one it must match.
   *
   * ⚑ Read the file docblock for what this does and does not attribute: field access and the hook each
   * stop a forged value on their own (measured), so this cannot be read as a test of either one
   * specifically. It is a test that forged provenance cannot reach the database through the ordinary
   * write path — and it fails when both guards go.
   */
  it('stamps grantedBy and grantedAt on a NEW row, written by the hook past field access', async () => {
    const target = await makeUser('prov-new')
    const forgedAt = '2000-01-01T00:00:00.000Z'

    await fx.payload.update({
      collection: 'users',
      id: target.id,
      data: {
        assignments: [
          {
            subjectGrade: fx.subjectGrade.id,
            role: 'editor',
            grantedBy: target.id,
            grantedAt: forgedAt,
          },
        ],
      },
      overrideAccess: false,
      user: fx.users.siteAdmin,
    })

    const rows = await assignmentsOf(target.id)
    expect(rows).toHaveLength(1)
    // ⚑ The whole point: a hook-set value on a field the client may not write must still reach the DB.
    expect(rows[0]!.grantedBy).toBe(fx.users.siteAdmin.id)
    expect(rows[0]!.grantedAt).toBeTruthy()
    // …and the forged values must not. Stated separately from the two above, which a hook that ignored
    // its input entirely would also satisfy — these are the ones that speak to a hostile body.
    expect(rows[0]!.grantedBy, 'a forged grantedBy must not reach the database').not.toBe(target.id)
    expect(rows[0]!.grantedAt, 'a forged grantedAt must not reach the database').not.toBe(forgedAt)
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
