/**
 * The Editing-access email boundary, per ROLE — the durable test review 2026-08-02 asked for.
 *
 * SPEC §8 as amended: `emailReadAccess` on `users` stays Site-Admin-or-self, but **Manage → Editing
 * access** shows addresses to every administrator who can grant access with it, so they can tell two
 * identical display names apart before making an authorization decision. `buildRolesAccess`
 * (`src/lib/editorGroups.ts`) is the whole boundary — role gate, trusted `overrideAccess: true` read,
 * and client projection in one unit.
 *
 * Why this test and not the widget tests. The unit tests prove that *supplied* email props render;
 * they cannot see the role → trusted query → serialized payload path, which is where the actual
 * disclosure is decided. The review put it plainly: this is an `overrideAccess: true` query exposing
 * the whole non-Site-Admin roster's addresses, and the only committed coverage was a heading
 * assertion. The boundary was also untestable until it was extracted out of the React server
 * component — that extraction is half of this fix.
 *
 * Requires a DB → the Rock, or a local stack with Postgres published (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { buildRolesAccess } from '../../src/lib/editorGroups.js'
import { mayIdentifyGrantCandidates } from '../../src/access/index.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const accessFor = (role: 'siteAdmin' | 'subjectAdmin' | 'editor' | 'teacher') =>
  buildRolesAccess({ payload: fx.payload, user: fx.users[role] })

/**
 * Every address that crossed into the client payload.
 *
 * ⚑ READS THE ROSTER, NOT THE GROUPS (D11a). Addresses used to ride on per-group `editors`/`addable`
 * arrays; they now cross once, on one shared roster, with the groups carrying ids. The property under
 * test is unchanged — WHICH addresses reach the client — so this helper moved rather than the tests.
 */
const emailsIn = (access: Awaited<ReturnType<typeof accessFor>>) =>
  access.roster.map((u) => u.email)

/**
 * The people offered as grant candidates, resolved back through the roster.
 *
 * `grantableIds` is sent ONCE for the whole payload (D11a) rather than per group — per-group
 * eligibility is this minus whoever already holds a role there, and the client derives it. The
 * disclosure question these tests ask is about the pool, so the pool is what they read.
 */
const grantableIn = (access: Awaited<ReturnType<typeof accessFor>>) => {
  const byId = new Map(access.roster.map((u) => [u.id, u]))
  return access.grantableIds.map((id) => byId.get(id)!)
}

describe('buildRolesAccess — the SPEC §8 email carve-out, by role', () => {
  it('gives a TEACHER nothing at all — no groups, so no query and no address', async () => {
    const access = await accessFor('teacher')
    expect(access.groups).toEqual([])
    expect(access.roster).toEqual([])
  })

  it('gives an EDITOR nothing either — an editor grant is not an administrative one', async () => {
    // The distinction the whole user-model language rests on: `editor` is a per-subject-grade
    // capability, not a governance role. An editor may edit prose; they may not see who else can.
    const access = await accessFor('editor')
    expect(access.groups).toEqual([])
    expect(access.roster).toEqual([])
  })

  it('runs NO QUERY for a non-administrator — the gate, not a lucky empty result', async () => {
    // ⚑ Written because deleting the early return did NOT fail the two tests above: with no
    // administered subject-grades the scoped query returns nothing, so the result is `[]` either way.
    // The empty payload was never the property at risk — the roster read is `overrideAccess: true`,
    // so without the gate a Teacher's request would still pull every user (and, if the email predicate
    // ever widened, every address) into server memory before discarding them. `buildRolesAccess`
    // claims "no query runs"; this is what makes that claim true rather than incidental.
    for (const role of ['teacher', 'editor'] as const) {
      const calls: string[] = []
      const spy = {
        ...fx.payload,
        find: ((args: { collection: string }) => {
          calls.push(args.collection)
          return fx.payload.find(args as Parameters<typeof fx.payload.find>[0])
        }) as typeof fx.payload.find,
      } as typeof fx.payload
      const access = await buildRolesAccess({ payload: spy, user: fx.users[role] })
      expect(access).toEqual({ roster: [], grantableIds: [], groups: [] })
      // The assertion that carries the weight: not "the result was empty" but "nothing was read".
      expect(calls, `${role} must trigger no read at all`).toEqual([])
    }
  })

  it('keeps the email predicate and the role gate deliberately in step', () => {
    // ⚑ `buildRolesAccess` has TWO independent conditions: the gate that decides whether groups are
    // built at all (`siteAdmin || adminSgIds.length`), and `mayIdentifyGrantCandidates`, which decides
    // whether the email column is selected. Today every role that clears the gate also clears the
    // predicate, so the `withEmail === false` branch is UNREACHABLE and therefore untested — and if the
    // gate were ever widened without widening the predicate, that branch would go live having never
    // run. Asserting the predicate directly, for all four roles, keeps the two explicitly related so a
    // divergence is a decision rather than a drift. (CodeRabbit, PR #184.)
    for (const role of ['teacher', 'editor'] as const) {
      expect(
        mayIdentifyGrantCandidates(fx.users[role]),
        `${role} must not identify candidates`,
      ).toBe(false)
    }
    for (const role of ['subjectAdmin', 'siteAdmin'] as const) {
      expect(mayIdentifyGrantCandidates(fx.users[role]), `${role} must identify candidates`).toBe(
        true,
      )
    }
  })

  it('gives a SUBJECT ADMIN addresses — the carve-out — scoped to subject-grades they administer', async () => {
    const access = await accessFor('subjectAdmin')
    expect(access.groups.length).toBeGreaterThan(0)
    // Rule 2: only their own subject-grades.
    expect(access.groups.map((g) => g.sgId)).toEqual([fx.subjectGrade.id])
    // Rule 3: the carve-out is live for them, not only for Site Admins. This is the assertion that
    // would have caught the pre-amendment behaviour, and equally a silent reversal of it.
    const emails = emailsIn(access)
    expect(emails.length).toBeGreaterThan(0)
    expect(emails.every((e) => typeof e === 'string' && e.includes('@'))).toBe(true)
  })

  it('gives a SITE ADMIN addresses too', async () => {
    const access = await accessFor('siteAdmin')
    expect(access.groups.length).toBeGreaterThan(0)
    const emails = emailsIn(access)
    expect(emails.length).toBeGreaterThan(0)
    expect(emails.every((e) => typeof e === 'string' && e.includes('@'))).toBe(true)
  })

  it('discloses the WHOLE grantable roster to a Subject Admin, not only their own subjects', async () => {
    // Recorded because SPEC §8's first draft claimed the opposite and an auditor would have relied on
    // it. Any teacher is grantable, so the candidate pool is the roster — inherent to a grant picker,
    // and a materially wider exposure than "their own subject-grades". Pinned so the SPEC sentence and
    // the code cannot drift apart again: if this is ever narrowed, this test is where it is stated.
    const access = await accessFor('subjectAdmin')
    const addable = grantableIn(access)
    // The plain teacher has no assignment anywhere, so they are grantable here despite having no
    // connection to this subject-grade.
    expect(addable.map((u) => u.id)).toContain(fx.users.teacher.id)
    expect(addable.find((u) => u.id === fx.users.teacher.id)?.email).toBe(fx.users.teacher.email)
  })

  it('never offers a Site Administrator as a grant candidate', async () => {
    // The reason the roster read is `overrideAccess: true`: `roles` is field-hidden from Subject
    // Admins, so a caller-scoped read could not identify site admins and this exclusion would fail
    // open for exactly the role that must not rely on it.
    const access = await accessFor('subjectAdmin')
    expect(grantableIn(access).map((u) => u.id)).not.toContain(fx.users.siteAdmin.id)
    // …and not on the shared roster either: the roster is what the client resolves ids against, so
    // an excluded candidate that still shipped in it would be an exclusion in name only.
    expect(access.roster.map((u) => u.id)).not.toContain(fx.users.siteAdmin.id)
  })

  /**
   * ⚑ D11a — the payload is users + subject-grades, not their product. Each group used to carry its
   * own arrays of full user objects, so at 100 users and 40 subject-grades the serialized RSC payload
   * ran to thousands of entries, each with an address under the carve-out. Asserted as a PROPERTY of
   * the shape (every id resolves, nobody appears twice) rather than as a size, so it cannot be
   * satisfied by a fixture that happens to be small.
   */
  it('sends each person ONCE, on a shared roster the group ids resolve against', async () => {
    const access = await accessFor('siteAdmin')
    const ids = access.roster.map((u) => u.id)
    expect(new Set(ids).size, 'the roster must be deduplicated').toBe(ids.length)

    const known = new Set(ids)
    for (const g of access.groups) {
      for (const id of g.editorIds) {
        expect(known.has(id), `group ${g.sgId} references id ${id} with no roster entry`).toBe(true)
      }
      for (const id of g.subjectAdminIds) {
        expect(known.has(id), `group ${g.sgId} names admin ${id} with no roster entry`).toBe(true)
      }
    }
    // The shared pool resolves too — it is the other half of what the client dereferences.
    for (const id of access.grantableIds) expect(known.has(id)).toBe(true)
  })

  /**
   * The role D6a makes Site-Admin-only still has to be VISIBLE to a Subject Administrator — that is
   * the presentation half of the decision. WHETHER they may change it is a prop supplied by the
   * render site, not a field of this projection, so it is asserted in the panel's unit spec.
   */
  it('carries EVERY Subject Administrator of that subject-grade, not just one', async () => {
    const asSubjectAdmin = await accessFor('subjectAdmin')
    const group = asSubjectAdmin.groups.find((g) => g.sgId === fx.subjectGrade.id)!
    // ⚑ `toContain` on a LIST, not equality with one id (2026-08-19). The projection carried
    // `subjectAdminId: number | null` assigned per assignment row, so with two holders the last one
    // seen won and the other was invisible — and `userRoles.ts` states that legacy rows violating ≤1
    // exist by design, while this role also marks versions Official. An assertion that reads one id
    // cannot tell "one administrator" from "one of several".
    expect(group.subjectAdminIds).toContain(fx.users.subjectAdmin.id)
    // The fixture grants exactly one, so the count is also part of the contract here: it is what
    // would fail if the walk ever double-counted a holder with two rows for the same grade.
    expect(group.subjectAdminIds).toHaveLength(1)
  })

  it('leaves every OTHER surface withholding addresses — emailReadAccess is unchanged', async () => {
    // The carve-out must stay confined to this one view. A caller-scoped read as the Subject Admin
    // must still strip other users' emails, or the amendment leaked into the API.
    const res = await fx.payload.find({
      collection: 'users',
      overrideAccess: false,
      user: fx.users.subjectAdmin,
      depth: 0,
      pagination: false,
    })
    const others = res.docs.filter((u) => u.id !== fx.users.subjectAdmin.id)
    expect(others.length).toBeGreaterThan(0)
    expect(others.map((u) => u.email).filter(Boolean)).toEqual([])
    // …and self is still visible, per Site-Admin-OR-SELF.
    const self = res.docs.find((u) => u.id === fx.users.subjectAdmin.id)
    expect(self?.email).toBe(fx.users.subjectAdmin.email)
  })

  it('carries the freshness token on every projected user', async () => {
    // The token the assignment endpoints compare to reject a stale page (409). It must be the real
    // stored timestamp — an earlier signature accepted `unknown` and could stringify `undefined`,
    // which never matches and so fails OPEN on a concurrency guard.
    const access = await accessFor('siteAdmin')
    expect(access.roster.length).toBeGreaterThan(0)
    for (const u of access.roster) {
      expect(u.updatedAt, `user ${u.id} must carry a real updatedAt`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})
