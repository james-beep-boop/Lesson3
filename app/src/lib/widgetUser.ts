/**
 * The Editing-access widget's client payload for one user, and the helpers that build and label it.
 *
 * ⚑ `WidgetUser` is declared HERE, not in the component. It previously lived in
 * `components/AdminDashboard/EditorsWidget.tsx` (now `components/Manage/RolesAccessPanel.tsx`) and
 * was imported back into this file — the only
 * import from `components/` anywhere in `src/lib/`, inverting the usual arrow (`lib/` is a leaf that
 * components depend on). The component re-exports it for its existing consumers.
 */
export interface WidgetUser {
  id: number
  name: string
  /**
   * The user's email address, shown to every viewer of this widget — Subject Administrators as well
   * as Site Administrators (SPEC §8 carve-out, operator decision 2026-08-02).
   *
   * THE CANONICAL STATEMENT OF WHY, referenced rather than repeated elsewhere: granting editing
   * access is an authorization decision, and a display name is not an identifier — two teachers can
   * share one, so a name-only list lets an administrator grant edit rights over a subject's content
   * to the wrong person with no way to notice. Withholding the only identifier the system holds made
   * the *privacy* rule safe at the cost of making the *authorization act* unsafe.
   *
   * Optional only because a user record may genuinely lack an address; `toWidgetUser` omits the key
   * rather than emitting an empty string. It is NOT a per-role flag — see `toWidgetUser` below.
   */
  email?: string
  /** Freshness token for the assignment endpoints — the row's updatedAt as this page rendered. */
  updatedAt: string
}

/**
 * What to call an account with no `name`.
 *
 * Shared with the messaging roster (`(frontend)/messages/page.tsx`), which had the identical
 * fallback inline: two places deciding what a nameless account is called meant renaming the string
 * would fix one surface and silently leave the other.
 */
export const userDisplayName = (u: { id: number; name?: string | null }): string =>
  u.name ?? `User ${u.id}`

/**
 * One-line identification of a person, for controls that cannot hold markup.
 *
 * Used by the grant picker's `<option>`s and by the remove confirmation and its toasts. The widget's
 * ROWS deliberately render the same two values as two DOM nodes instead (the address needs its own
 * muted class), and that is the one intentional exception — but the STRING form is shared, because
 * "who is this person" should not be decided in four places. In particular the destructive
 * confirmation must identify people as precisely as the grant picker does: revoking access is the
 * same kind of decision as granting it, and a name-only dialog is identical for two people who
 * share a display name.
 */
export const personLabel = (u: WidgetUser): string => (u.email ? `${u.name} — ${u.email}` : u.name)

/**
 * Build the widget payload for one user.
 *
 * **Includes the email unconditionally** — for every viewer of this widget, which is Subject and Site
 * Administrators only. See `WidgetUser.email` for the reasoning.
 *
 * ⚑ This took an `includeEmail` flag, gating the address to Site Admins. The flag is GONE rather
 * than defaulted, and that is the point: a boolean that is true at every call site is not a safety
 * mechanism, it is a way to pass `false` by accident. A reviewer observed that the unit tests would
 * stay green if the call site flipped it — correct, and the fix is to delete the parameter, not to
 * write a test that watches it. There is nothing left to get wrong here.
 *
 * The boundary that still matters is therefore NOT in this file: it is that the Editing-access
 * section renders only for administrators, gated in `AdminDashboard/index.tsx` on the named
 * `mayIdentifyGrantCandidates` predicate. `emailReadAccess` on the `users` collection is UNCHANGED —
 * Site-Admin-or-self — so every other surface still withholds addresses.
 */
export function toWidgetUser(user: {
  id: number
  name?: string | null
  email?: string | null
  /**
   * REQUIRED, and typed as the `string` Payload actually stores — not `unknown`.
   *
   * This is the freshness token: the assignment endpoints reject a stale page (409) by comparing it,
   * which is what stops a concurrent administrator's role change being silently overwritten. The
   * previous `updatedAt?: unknown` let an omitted value through and `String(undefined)` turned it
   * into the literal `"undefined"` — a token that is never stale-detected because it never matches,
   * failing OPEN on a concurrency guard. Requiring the real timestamp makes that a type error at the
   * call site instead of a runtime string (review 2026-08-02).
   */
  updatedAt: string
}): WidgetUser {
  return {
    id: user.id,
    name: userDisplayName(user),
    // Omit the key rather than emit null/'' — an empty string would still cross the wire and still
    // render as a stray separator beside the name.
    ...(user.email ? { email: user.email } : {}),
    updatedAt: user.updatedAt,
  }
}
