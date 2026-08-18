import { redirect } from 'next/navigation'

/**
 * Native list-view replacements for collections whose working UI lives elsewhere. Lesson plans and
 * versions redirect to the library/Manage flow; Users redirects to its lazy Manage panel. The
 * collections stay VISIBLE (not `admin.hidden`) because Payload blocks the DOCUMENT routes of hidden
 * collections too (verified in @payloadcms/next `views/Document`: non-drawer renders 404 unless
 * `visibleEntities` includes the slug) — and their document routes must remain reachable.
 */
export default function RedirectToManage(): never {
  redirect('/admin')
}

/** The native Users table is replaced by the lazy Manage panel, opened on arrival. */
export function RedirectUsersToManage(): never {
  redirect('/admin?open=users')
}
