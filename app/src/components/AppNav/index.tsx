import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

import { canUseAdminPanel, userTypeLabel } from '../../access'
import { resolveAccessSummary } from '../../lib/accessScopes'
import { UserMenu } from '../UserMenu'
import type { User } from '../../payload-types'

/**
 * The ONE top navigation, rendered identically on both surfaces (the frontend header and the admin
 * header) so they match — same items, order, and styling. Items:
 *
 *   Lessons · [Manage] · Guide · {avatar dropdown}
 *
 * "Manage" appears only for users who can use the admin panel (anyone with editing access, a
 * subject-grade admin, or a site admin); plain Teachers see Lessons · Guide · avatar. Plain `<a>`
 * links: the frontend (`/`, `/guide`, `/messages`)
 * and the admin (`/admin`) are separate Next apps, so cross-surface nav must be a full navigation —
 * using `<a>` for every item keeps the markup (and behavior) identical on both surfaces.
 *
 * Messages lives INSIDE the avatar dropdown (below the email, above Log Out), not as a top-level item.
 * The unread badge is the in-app half of the §10 notification model (server-rendered per page load —
 * no websockets/polling; see DECISIONS 2026-07-02): counted here and passed to the menu, which shows
 * it both on the avatar (so unread is visible without opening the menu) and on the Messages item.
 */
export async function AppNav({ user }: { user: User }) {
  const payload = await getPayload({ config })
  // Independent reads → run concurrently, both best-effort so the nav can't break on a DB hiccup.
  // Truthfulness contract (decided 2026-07-29): the TYPE is always shown — it's pure, never queried,
  // so it can't be wrong. The scope-label *lines* need a read (subject-grade names), so on failure
  // they degrade to absent — the same posture as the unread count degrading to 0. This omits detail,
  // it does not misstate: editing access is server-enforced and unaffected, and the type is unchanged
  // (an editor is a "Teacher" with or without the line). A "(unavailable)" placeholder would be
  // uglier and no more useful, so we show the type alone.
  const [unread, summary] = await Promise.all([
    countUnread(payload, user),
    resolveAccessSummary(payload, user).catch(() => ({ typeLabel: userTypeLabel(user), lines: [] })),
  ])
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
        typeLabel={summary.typeLabel}
        scopeLines={summary.lines}
        displayName={user.name ?? user.email}
        loginName={user.email}
        unread={unread}
        userId={user.id}
      />
    </nav>
  )
}

/** The session user's unread-message count. A trusted server-side projection (overrideAccess with
 *  an explicit recipient filter — the recipient IS the session user, so nothing foreign leaks).
 *  Best-effort: navigation must never break on a counting hiccup, so failures render as 0. */
async function countUnread(payload: Awaited<ReturnType<typeof getPayload>>, user: User): Promise<number> {
  try {
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
