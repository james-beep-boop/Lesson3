import { redirect } from 'next/navigation'

/**
 * Custom admin "unauthorized" view (overrides Payload's built-in via
 * `admin.components.views.unauthorized`). Teachers live entirely in "The App" frontend and are
 * excluded from `/admin` (SPEC §2; DECISIONS 2026-06-14). When an authenticated user who lacks
 * admin-panel access reaches the admin panel — e.g. a Teacher authenticating at `/admin/login`,
 * or a stale post-logout cookie reopening `/admin` — Payload redirects them here. Instead of the
 * hard "this user does not have access to the admin panel" error, send them to the lesson-plans
 * home where they belong.
 *
 * This is the single chokepoint Payload routes ALL admin-access denials through
 * (`handleAuthRedirect` → `admin.routes.unauthorized`), so it covers every path in. A server-side
 * redirect means no error flash. It only ever runs for a user who failed `canUseAdminPanel`
 * (Teachers); every authenticated user can view `/` (it gates with `requireUser`), so the target
 * is always valid.
 */
export default function AdminUnauthorizedRedirect() {
  redirect('/')
}
