import type { Payload } from 'payload'

import { isSiteAdmin, mayIdentifyGrantCandidates, subjectGradeIdsByRole, toId } from '../access'
import type { User } from '../payload-types'
import { toWidgetUser } from './widgetUser'
import type { WidgetUser } from './widgetUser'

/**
 * One subject-grade's roles, as ID LISTS against the shared roster below.
 *
 * ⚑ IDS, NOT PEOPLE (D11a, external review 2026-08-16). Each group used to carry its own `editors`
 * and `addable` arrays of full user objects, so the serialized RSC payload grew as roughly
 * users × subject-grades — at 100 users and 40 subject-grades, thousands of entries, each carrying
 * an email address under the SPEC §8 carve-out.
 *
 * ⚑ AND `addableIds` IS GONE, which is what actually makes that claim true. The first version of
 * this reshape kept a per-group `addableIds` array — ~every non-site-admin user, per group — so the
 * payload was STILL users × subject-grades, just in integers rather than objects. Measured at
 * 100 × 40 it was 14.7 KB of the 21.3 KB total. The grant pool is `grantableIds` minus whoever holds
 * a role here, which the client can derive from what it already has, so it crosses the wire ONCE.
 */
export interface RolesAccessGroup {
  sgId: number
  sgLabel: string
  /** Users with an `editor` grant here. */
  editorIds: number[]
  /**
   * Everyone holding a `subjectAdmin` grant here — a LIST, not a single id.
   *
   * ⚑ IT WAS `subjectAdminId: number | null` UNTIL 2026-08-19, and that shape hid data. The walk below
   * assigns per assignment row, so with two holders the last one seen won and the other was invisible
   * — no warning, no count, nothing to notice. `access/index.ts` documents that a same-subject-grade
   * admin+editor pair is reachable, and D6a is FORWARD-ONLY, so `userRoles.ts` states outright that
   * "legacy rows that violate ≤1 exist by design". This role also marks versions Official, so an
   * undisclosed second administrator was an authorization blind spot rather than a cosmetic gap.
   *
   * ≤1 remains the POLICY, enforced by `autoDemotePriorSubjectAdmins`. The list is what the data can
   * actually contain, which is a different question from what the policy allows.
   */
  subjectAdminIds: number[]
}

/**
 * The whole payload for Manage → Roles & Access: one deduplicated roster plus per-subject-grade id
 * lists.
 *
 * ⚑ DATA AND DISCLOSURE ONLY. Whether the viewer may CHANGE a Subject Administrator is a
 * presentational capability and is passed to the panel as a prop by the render site, which already
 * holds `siteAdmin`. It briefly lived here, which put a presentation flag inside the return type of
 * the email-carve-out projection — the one function whose docblock exists to keep its role gate,
 * trusted query and projection inseparable. The first person wanting "may vacate but not appoint"
 * would then have edited a boolean inside the carve-out.
 */
export interface RolesAccess {
  /** Every user the pickers and lists resolve against, listed ONCE. */
  roster: WidgetUser[]
  /**
   * Everyone who may be granted a role anywhere — the whole non-site-admin roster, once.
   *
   * Per-group eligibility is this minus the people who already hold a role in that group, which the
   * client derives; see the ⚑ on `RolesAccessGroup`. Site admins are excluded here because they are
   * never grant candidates and `roles` never reaches the client, so the exclusion has to happen
   * server-side to happen at all.
   */
  grantableIds: number[]
  groups: RolesAccessGroup[]
}

/**
 * Build the Manage → Editing access groups for one viewer: who currently has editing access in each
 * subject-grade the viewer administers, and who is grantable there.
 *
 * ⚑ THIS FUNCTION IS THE PRIVACY BOUNDARY, and it exists as a function for that reason. It owns all
 * three parts together — the role gate, the trusted (`overrideAccess: true`) query, and the client
 * projection — because the boundary is only sound while they cannot be separated. Inlined in the
 * Manage server component it was an EMERGENT property: four unrelated conditions happened to consult
 * one general-purpose `isAdmin` boolean, so widening that boolean for a presentational reason (it also
 * selects copy strings and the author column) would silently have widened an email disclosure, with
 * nothing failing. Reviewed 2026-08-02: "the new privacy boundary lacks a durable role-level test" —
 * it could not have one while it lived inside an RSC.
 *
 * The rules it enforces, in order:
 *
 *  1. **Non-administrators get NOTHING.** A teacher with editing access or Teacher returns `[]` — no query runs, so no
 *     address is even fetched, let alone serialized into the page.
 *  2. **Subject-grade scoping** on the groups shown: a Subject Admin sees only the subject-grades they
 *     administer. A Site Admin sees all.
 *  3. **The SPEC §8 email carve-out** (amended 2026-08-02): the `email` column is selected only when
 *     `mayIdentifyGrantCandidates` allows it, because granting editing access is an authorization
 *     decision and a display name is not an identifier. ⚑ The `addable` pool is deliberately the WHOLE
 *     roster minus site admins and minus people already assigned here — any teacher is grantable — so
 *     this discloses every non-Site-Admin address to any administrator. That is inherent to a grant
 *     picker and is recorded as such in SPEC §8; it is NOT bounded by the viewer's subject-grades.
 *
 * The read is `overrideAccess: true` deliberately: `roles` is field-hidden from Subject Admins
 * (`siteAdminField`), so a caller-scoped read cannot tell which users are site admins and the
 * addable-exclusion in rule 3 would silently fail for them (Codex round-3 #2). `roles`/`assignments`
 * are consumed here only for grouping and never reach the client.
 *
 * `emailReadAccess` on the `users` collection is UNCHANGED (Site-Admin-or-self), so every other
 * surface — REST, Local API, the messaging roster — still withholds addresses.
 */
export async function buildRolesAccess({
  payload,
  user,
}: {
  payload: Payload
  user: User | null
}): Promise<RolesAccess> {
  const siteAdmin = isSiteAdmin(user)
  const adminSgIds = subjectGradeIdsByRole(user, ['subjectAdmin'])
  // Rule 1. Returning before either query is what makes "no address reaches a non-admin" a property
  // of this function rather than of the caller's markup.
  if (!siteAdmin && adminSgIds.length === 0) {
    return { roster: [], grantableIds: [], groups: [] }
  }

  const withEmail = mayIdentifyGrantCandidates(user)

  const [sgsRes, usersRes] = await Promise.all([
    payload.find({
      collection: 'subject-grades',
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
      sort: 'displayName',
      // Rule 2.
      where: siteAdmin ? {} : { id: { in: adminSgIds } },
      select: { displayName: true },
    }),
    payload.find({
      collection: 'users',
      overrideAccess: true,
      depth: 0,
      pagination: false,
      sort: 'name',
      // Rule 3 — the column is not fetched at all unless the viewer may see it.
      select: {
        name: true,
        roles: true,
        assignments: true,
        updatedAt: true,
        ...(withEmail ? { email: true } : {}),
      },
    }),
  ])

  const allUsers = usersRes.docs
  const widgetUser = (u: (typeof allUsers)[number]) =>
    toWidgetUser(u as typeof u & { email?: string | null; updatedAt: string })

  /**
   * ONE pass over the roster, not three per subject-grade.
   *
   * The first version filtered `allUsers` once for editors, once for the administrator and once for
   * the grant pool, inside a `.map` over subject-grades — so each user's assignment list was walked
   * three times per group (12,000 predicate calls at 100 users × 40 subject-grades, to describe 100
   * people). Walking assignments instead of users is the natural shape: an assignment row already
   * names the subject-grade it belongs to.
   */
  const byGroup = new Map<number, { editorIds: number[]; subjectAdminIds: number[] }>()
  for (const sg of sgsRes.docs) byGroup.set(sg.id, { editorIds: [], subjectAdminIds: [] })
  for (const u of allUsers) {
    for (const a of u.assignments ?? []) {
      const slot = byGroup.get(toId(a.subjectGrade) ?? -1)
      if (!slot) continue
      if (a.role === 'editor') slot.editorIds.push(u.id)
      // ⚑ COLLECT, do not overwrite. This was `slot.subjectAdminId = u.id`, chosen over `.find` so
      // that row order could not produce "No administrator." for a grade that has one — correct as
      // far as it went, but it made a SECOND holder invisible instead. Nothing at the DB level
      // forbids two (no unique index; the ≤1 rule lives in `autoDemotePriorSubjectAdmins`), so the
      // projection now reports what is there and the panel renders a list.
      if (a.role === 'subjectAdmin') slot.subjectAdminIds.push(u.id)
    }
  }

  const groups: RolesAccessGroup[] = sgsRes.docs.map((sg) => ({
    sgId: sg.id,
    // `||`, not `??`: a present-but-empty displayName would otherwise render as a bare separator.
    sgLabel: sg.displayName || `Subject grade ${sg.id}`,
    ...byGroup.get(sg.id)!,
  }))

  // Rule 3's exclusion, unchanged and still server-side: a site admin is never a grant candidate,
  // and `roles` never reaches the client, so this cannot be done there.
  const grantable = allUsers.filter((u) => !u.roles?.includes('siteAdmin'))

  /**
   * ⚑ THE ROSTER IS THE WHOLE NON-SITE-ADMIN LIST, ONCE — and that is the same disclosure the old
   * per-group `addable` arrays made, not a wider one. SPEC §8 already records that a grant picker
   * inherently shows every grantable address to any administrator; what changes here is that each
   * address crosses the wire once instead of once per subject-grade.
   *
   * Site admins are excluded because they are never grant candidates and their `roles` never reach
   * the client — the one place their absence is load-bearing is the addable rule above.
   */
  const rosterIds = new Set<number>(grantable.map((u) => u.id))
  // …plus anyone who holds a role here but is NOT grantable — a site admin who holds a
  // `subjectAdmin` row, which D6a's forward-only rule means legacy data can contain. Without this
  // their id would dangle against the roster and the panel would render a blank administrator.
  for (const g of groups) for (const id of g.subjectAdminIds) rosterIds.add(id)

  return {
    roster: allUsers.filter((u) => rosterIds.has(u.id)).map(widgetUser),
    grantableIds: grantable.map((u) => u.id),
    groups,
  }
}
