import React from 'react'

import { canUseAdminPanel, userTypeLabel } from '../../access'
import { UserMenu } from '../UserMenu'
import type { User } from '../../payload-types'

/**
 * The ONE top navigation, rendered identically on both surfaces (the frontend header and the admin
 * header) so they match — same items, order, and styling. Items:
 *
 *   Lessons · [Manage] · Guide · {avatar dropdown}
 *
 * "Manage" appears only for users who can use the admin panel (Editor / Subject Admin / Site Admin);
 * Teachers see Lessons · Guide · avatar. Plain `<a>` links: the frontend (`/`, `/guide`) and the admin
 * (`/admin`) are separate Next apps, so cross-surface nav must be a full navigation — using `<a>` for
 * every item keeps the markup (and behavior) identical on both surfaces.
 */
export function AppNav({ user }: { user: User }) {
  return (
    <nav className="app-nav" aria-label="Primary">
      {/* eslint-disable @next/next/no-html-link-for-pages */}
      <a className="app-nav__link" href="/">
        Lessons
      </a>
      {canUseAdminPanel(user) && (
        <a className="app-nav__link" href="/admin">
          Manage
        </a>
      )}
      <a className="app-nav__link" href="/guide">
        Guide
      </a>
      {/* eslint-enable @next/next/no-html-link-for-pages */}
      <UserMenu
        typeLabel={userTypeLabel(user)}
        displayName={user.name ?? user.email}
        loginName={user.email}
      />
    </nav>
  )
}
