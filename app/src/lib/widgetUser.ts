import type { WidgetUser } from '../components/AdminDashboard/EditorsWidget'

/**
 * Build the Editing-access widget's client payload for one user.
 *
 * This exists as a pure function, separate from the dashboard's data fetching, because of the one
 * rule it enforces: **`email` is included only for a Site Administrator.**
 *
 * `emailReadAccess` is Site-Admin-or-self (SPEC §8; "Non–Site-Admins never see others' emails"),
 * and the Editing-access widget also renders for SUBJECT Administrators, who manage editors within
 * their own subject-grades. The roster it is built from is read with `overrideAccess: true` — a
 * trusted projection, needed because `roles` is field-hidden from Subject Admins — so nothing
 * downstream strips the column. This function is the thing that withholds it.
 *
 * Keeping it pure and exported makes that rule testable with real inputs instead of by reading the
 * call site: the failure mode (drop the flag, every Subject Admin sees the roster's addresses) is
 * silent, invisible in the UI, and would pass every rendering test.
 */
export function toWidgetUser(
  user: { id: number; name?: string | null; email?: string | null; updatedAt?: unknown },
  opts: { includeEmail: boolean },
): WidgetUser {
  const email = opts.includeEmail ? (user.email ?? undefined) : undefined
  return {
    id: user.id,
    name: user.name ?? `User ${user.id}`,
    ...(email ? { email } : {}),
    updatedAt: String(user.updatedAt),
  }
}
