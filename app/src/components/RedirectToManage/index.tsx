import { redirect } from 'next/navigation'

/**
 * Native list-view replacements for collections whose working UI lives in Manage.
 *
 * The collections stay VISIBLE (not `admin.hidden`) because Payload blocks the DOCUMENT routes of
 * hidden collections too (verified in @payloadcms/next `views/Document`: non-drawer renders 404
 * unless `visibleEntities` includes the slug) — and their document routes must remain reachable.
 *
 * ⚑ A FACTORY, not one exported function per collection. This file held two near-identical
 * one-liners after PR 2b and PR 3 adds two more; at four, the differences worth seeing are the
 * destination and the reason, and those are exactly what a wall of near-identical exports hides.
 * Each call below reads as a row in a table.
 *
 * Every destination is a Manage panel id from the CLOSED vocabulary in `Manage/panelState.ts`. That
 * matters more than it looks: a redirect naming a panel that does not exist still renders a normal
 * Manage page — `parseOpen` scrubs unknown ids — so a typo here fails SILENTLY, landing the user on
 * Manage with nothing opened. `PanelId` makes it a compile error instead.
 */
import type { PanelId } from '../Manage/panelState'

const toManagePanel = (panel: PanelId) => (): never => redirect(`/admin?open=${panel}`)

/** Lesson plans and versions: the library/Manage flow replaces both native tables. */
export default function RedirectToManage(): never {
  redirect('/admin')
}

/** The native Users table is replaced by the lazy Manage panel, opened on arrival (PR 2b). */
export const RedirectUsersToManage = toManagePanel('users')

/** Subjects — academic disciplines (PR 3). */
export const RedirectSubjectsToManage = toManagePanel('subjects')

/** Subject grades — the units roles and lesson plans attach to (PR 3). */
export const RedirectSubjectGradesToManage = toManagePanel('subject-grades')
