import { redirect } from 'next/navigation'

/**
 * Custom admin "login" view (overrides Payload's built-in via `admin.components.views.login`).
 *
 * There is ONE login form in this product — the frontend `/login` (SPEC §2: The App is the surface
 * everyone signs into; Teachers can't use `/admin` at all). The session cookie is shared, so once a
 * user signs in there, `/admin` works for admin-capable roles. To avoid a second, redundant login
 * screen, send anyone who lands on `/admin/login` to the single frontend login. Mirrors the
 * `views.unauthorized` redirect; a server-side redirect means no flash.
 */
export default function AdminLoginRedirect() {
  redirect('/login')
}
