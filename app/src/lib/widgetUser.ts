import type { WidgetUser } from '../components/AdminDashboard/EditorsWidget'

/**
 * Build the Editing-access widget's client payload for one user.
 *
 * **Includes the email address unconditionally** — for every viewer of this widget, which is Subject
 * Administrators and Site Administrators only (SPEC §8 amendment, operator decision 2026-08-02).
 * Granting editing access is an authorization decision and a display name is not an identifier: two
 * teachers can share one, so a name-only list lets an administrator grant edit rights to the wrong
 * person with no way to notice.
 *
 * ⚑ The earlier version of this function took an `includeEmail` flag, gating the address to Site
 * Admins. The flag is GONE rather than defaulted, and that is the point: a boolean that is true at
 * every call site is not a safety mechanism, it is a way to pass `false` by accident. A reviewer
 * observed that the unit tests would stay green if the call site flipped it — correct, and the fix
 * is to delete the parameter, not to write a test that watches it. There is nothing left to get
 * wrong here.
 *
 * The boundary that still matters is therefore NOT in this file: it is that the Editing-access
 * section renders only for Subject/Site Admins (`editorGroups` is empty for anyone else, because
 * the subject-grade query it is built from is gated on `isAdmin`). `emailReadAccess` on the `users`
 * collection is UNCHANGED — Site-Admin-or-self — so every other surface still withholds addresses.
 */
export function toWidgetUser(user: {
  id: number
  name?: string | null
  email?: string | null
  updatedAt?: unknown
}): WidgetUser {
  return {
    id: user.id,
    name: user.name ?? `User ${user.id}`,
    // Omit the key rather than emit null/'' — an empty string would still cross the wire and still
    // render as a stray separator beside the name.
    ...(user.email ? { email: user.email } : {}),
    updatedAt: String(user.updatedAt),
  }
}
