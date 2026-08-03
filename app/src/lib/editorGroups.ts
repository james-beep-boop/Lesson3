import type { Payload } from 'payload'

import { isSiteAdmin, mayIdentifyGrantCandidates, subjectGradeIdsByRole, toId } from '../access'
import type { User } from '../payload-types'
import { toWidgetUser } from './widgetUser'
import type { WidgetUser } from './widgetUser'

export interface EditorsGroup {
  sgId: number
  sgLabel: string
  editors: WidgetUser[]
  addable: WidgetUser[]
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
 *  1. **Non-administrators get NOTHING.** An Editor or Teacher returns `[]` — no query runs, so no
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
export async function buildEditorGroups({
  payload,
  user,
}: {
  payload: Payload
  user: User | null
}): Promise<EditorsGroup[]> {
  const siteAdmin = isSiteAdmin(user)
  const adminSgIds = subjectGradeIdsByRole(user, ['subjectAdmin'])
  // Rule 1. Returning before either query is what makes "no address reaches a non-admin" a property
  // of this function rather than of the caller's markup.
  if (!siteAdmin && adminSgIds.length === 0) return []

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

  return sgsRes.docs.map((sg) => {
    const editors = allUsers.filter((u) =>
      (u.assignments ?? []).some((a) => toId(a.subjectGrade) === sg.id && a.role === 'editor'),
    )
    const addable = allUsers.filter(
      (u) =>
        !u.roles?.includes('siteAdmin') &&
        !(u.assignments ?? []).some((a) => toId(a.subjectGrade) === sg.id),
    )
    return {
      sgId: sg.id,
      sgLabel: sg.displayName ?? `Subject grade ${sg.id}`,
      editors: editors.map(widgetUser),
      addable: addable.map(widgetUser),
    }
  })
}
