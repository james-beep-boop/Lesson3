import { redirect } from 'next/navigation'

/**
 * List-view replacement for the lesson content collections (IA redesign PR ③): the LIBRARY (`/`) is
 * the only list of lessons, and Manage (`/admin`) is the only functions page — so the native admin
 * LIST routes for `lesson-plans` and `lesson-bundle-versions` redirect to Manage instead of rendering
 * a table. The collections stay VISIBLE (not `admin.hidden`) because Payload blocks the DOCUMENT
 * routes of hidden collections too (verified in @payloadcms/next `views/Document`: non-drawer renders
 * 404 unless `visibleEntities` includes the slug) — and the version editor + plan repair form must
 * stay reachable from Manage/lesson-page links. Their nav entries are hidden in custom.scss
 * (`nav-group-Lesson plans`).
 */
export default function RedirectToManage(): never {
  redirect('/admin')
}
