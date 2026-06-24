import React from 'react'

import { Avatar } from '../Avatar'
import { LogoutButton } from '../LogoutButton'
import type { User } from '../../payload-types'

/**
 * Admin top-right user menu (admin.components.header) — the SAME menu as the frontend header, so
 * the two surfaces match: username · Lessons · logout · avatar. "Lessons" links to The App (the
 * surface you're not on; the frontend's menu shows "Admin" instead). Payload's own nav logout is
 * hidden in custom.scss so there's one logout, top-right, everywhere.
 *
 * Rendered at the top of the admin template with `serverProps` (incl. the signed-in `user`).
 */
export default function AdminHeaderMenu({ user }: { user?: User | null }) {
  const name = user?.name ?? user?.email ?? 'Account'
  return (
    <header className="lp-admin-header">
      <nav className="lp-admin-header__menu">
        <span className="lp-admin-header__user">{name}</span>
        {/* Full navigation to The App (a separate surface) — a plain <a> is intentional. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="lp-admin-header__link" href="/">
          Lessons
        </a>
        <LogoutButton />
        <Avatar name={name} />
      </nav>
    </header>
  )
}
