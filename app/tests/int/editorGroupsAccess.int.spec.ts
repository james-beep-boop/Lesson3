/**
 * The Editing-access email boundary, per ROLE — the durable test review 2026-08-02 asked for.
 *
 * SPEC §8 as amended: `emailReadAccess` on `users` stays Site-Admin-or-self, but **Manage → Editing
 * access** shows addresses to every administrator who can grant access with it, so they can tell two
 * identical display names apart before making an authorization decision. `buildEditorGroups`
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
import { buildEditorGroups } from '../../src/lib/editorGroups.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const groupsFor = (role: 'siteAdmin' | 'subjectAdmin' | 'editor' | 'teacher') =>
  buildEditorGroups({ payload: fx.payload, user: fx.users[role] })

/** Every address that crossed into the client payload, from both halves of every group. */
const emailsIn = (groups: Awaited<ReturnType<typeof groupsFor>>) =>
  groups.flatMap((g) => [...g.editors, ...g.addable]).map((u) => u.email)

describe('buildEditorGroups — the SPEC §8 email carve-out, by role', () => {
  it('gives a TEACHER nothing at all — no groups, so no query and no address', async () => {
    const groups = await groupsFor('teacher')
    expect(groups).toEqual([])
  })

  it('gives an EDITOR nothing either — an editor grant is not an administrative one', async () => {
    // The distinction the whole user-model language rests on: `editor` is a per-subject-grade
    // capability, not a governance role. An editor may edit prose; they may not see who else can.
    const groups = await groupsFor('editor')
    expect(groups).toEqual([])
  })

  it('runs NO QUERY for a non-administrator — the gate, not a lucky empty result', async () => {
    // ⚑ Written because deleting the early return did NOT fail the two tests above: with no
    // administered subject-grades the scoped query returns nothing, so the result is `[]` either way.
    // The empty payload was never the property at risk — the roster read is `overrideAccess: true`,
    // so without the gate a Teacher's request would still pull every user (and, if the email predicate
    // ever widened, every address) into server memory before discarding them. `buildEditorGroups`
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
      const groups = await buildEditorGroups({ payload: spy, user: fx.users[role] })
      expect(groups).toEqual([])
      expect(calls, `${role} must trigger no read at all`).toEqual([])
    }
  })

  it('gives a SUBJECT ADMIN addresses — the carve-out — scoped to subject-grades they administer', async () => {
    const groups = await groupsFor('subjectAdmin')
    expect(groups.length).toBeGreaterThan(0)
    // Rule 2: only their own subject-grades.
    expect(groups.map((g) => g.sgId)).toEqual([fx.subjectGrade.id])
    // Rule 3: the carve-out is live for them, not only for Site Admins. This is the assertion that
    // would have caught the pre-amendment behaviour, and equally a silent reversal of it.
    const emails = emailsIn(groups)
    expect(emails.length).toBeGreaterThan(0)
    expect(emails.every((e) => typeof e === 'string' && e.includes('@'))).toBe(true)
  })

  it('gives a SITE ADMIN addresses too', async () => {
    const groups = await groupsFor('siteAdmin')
    expect(groups.length).toBeGreaterThan(0)
    const emails = emailsIn(groups)
    expect(emails.length).toBeGreaterThan(0)
    expect(emails.every((e) => typeof e === 'string' && e.includes('@'))).toBe(true)
  })

  it('discloses the WHOLE grantable roster to a Subject Admin, not only their own subjects', async () => {
    // Recorded because SPEC §8's first draft claimed the opposite and an auditor would have relied on
    // it. Any teacher is grantable, so the candidate pool is the roster — inherent to a grant picker,
    // and a materially wider exposure than "their own subject-grades". Pinned so the SPEC sentence and
    // the code cannot drift apart again: if this is ever narrowed, this test is where it is stated.
    const groups = await groupsFor('subjectAdmin')
    const addable = groups.flatMap((g) => g.addable)
    // The plain teacher has no assignment anywhere, so they are grantable here despite having no
    // connection to this subject-grade.
    expect(addable.map((u) => u.id)).toContain(fx.users.teacher.id)
    expect(addable.find((u) => u.id === fx.users.teacher.id)?.email).toBe(fx.users.teacher.email)
  })

  it('never offers a Site Administrator as a grant candidate', async () => {
    // The reason the roster read is `overrideAccess: true`: `roles` is field-hidden from Subject
    // Admins, so a caller-scoped read could not identify site admins and this exclusion would fail
    // open for exactly the role that must not rely on it.
    const groups = await groupsFor('subjectAdmin')
    const addable = groups.flatMap((g) => g.addable)
    expect(addable.map((u) => u.id)).not.toContain(fx.users.siteAdmin.id)
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
    const groups = await groupsFor('siteAdmin')
    const everyone = groups.flatMap((g) => [...g.editors, ...g.addable])
    expect(everyone.length).toBeGreaterThan(0)
    for (const u of everyone) {
      expect(u.updatedAt, `user ${u.id} must carry a real updatedAt`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})
