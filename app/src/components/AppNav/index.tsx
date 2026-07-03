import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

import { canUseAdminPanel, userTypeLabel } from '../../access'
import { UserMenu } from '../UserMenu'
import type { User } from '../../payload-types'

/**
 * The ONE top navigation, rendered identically on both surfaces (the frontend header and the admin
 * header) so they match — same items, order, and styling. Items:
 *
 *   Lessons · Messages(n) · [Manage] · Guide · {avatar dropdown}
 *
 * "Manage" appears only for users who can use the admin panel (Editor / Subject Admin / Site Admin);
 * Teachers see Lessons · Messages · Guide · avatar. Plain `<a>` links: the frontend (`/`, `/guide`,
 * `/messages`) and the admin (`/admin`) are separate Next apps, so cross-surface nav must be a full
 * navigation — using `<a>` for every item keeps the markup (and behavior) identical on both surfaces.
 *
 * The Messages badge is the in-app half of the §10 notification model (server-rendered per page
 * load — no websockets/polling; see DECISIONS 2026-07-02). An async server component on both
 * surfaces, so it counts its own unread here instead of prop-plumbing through two layouts.
 */
export async function AppNav({ user }: { user: User }) {
  const unread = await countUnread(user)
  return (
    <nav className="app-nav" aria-label="Primary">
      {/* eslint-disable @next/next/no-html-link-for-pages */}
      <a className="app-nav__link" href="/">
        Lessons
      </a>
      <a className="app-nav__link" href="/messages">
        Messages
        {unread > 0 && (
          <span className="app-nav__badge" aria-label={`${unread} unread`}>
            {unread}
          </span>
        )}
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

/** The session user's unread-message count. A trusted server-side projection (overrideAccess with
 *  an explicit recipient filter — the recipient IS the session user, so nothing foreign leaks).
 *  Best-effort: navigation must never break on a counting hiccup, so failures render as 0. */
async function countUnread(user: User): Promise<number> {
  try {
    const payload = await getPayload({ config })
    const { totalDocs } = await payload.count({
      collection: 'messages',
      where: {
        and: [{ recipient: { equals: user.id } }, { readAt: { exists: false } }],
      },
      overrideAccess: true,
    })
    return totalDocs
  } catch {
    return 0
  }
}
