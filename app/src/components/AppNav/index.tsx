import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

import { canUseAdminPanel, userTypeLabel } from '../../access'
import { resolveAccessSummary } from '../../lib/accessScopes'
import { hasUnread } from '../../lib/discussions'
import { schoolNameForRender, systemFlagsForRender } from '../../lib/systemFlags'
import SchoolName from '../SchoolName'
import { UserMenu } from '../UserMenu'
import NavigationFreshness from './NavigationFreshness'
import type { User } from '../../payload-types'

/**
 * The ONE top navigation, rendered identically on both surfaces (the frontend header and the admin
 * header) so they match — same items, order, and styling. Items:
 *
 *   Lessons · [Discuss] · [Manage] · Guide · {avatar dropdown}
 *
 * "Discuss" appears only while the forum is switched on, for everyone (§16.4 "Off switch"), with a blue
 * dot when something in a discussion you take part in is unread (§16.1). The switch is the render's one
 * reading (`systemFlagsForRender`), the same one the Discussions page gate uses.
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
export async function AppNav({
  user,
  watchNavigation = false,
}: {
  user: User
  /** Frontend only: re-check the forum state after soft navigations (`NavigationFreshness`). */
  watchNavigation?: boolean
}) {
  const payload = await getPayload({ config })
  // Independent reads → run concurrently, both best-effort so the nav can't break on a DB hiccup.
  // Truthfulness contract (decided 2026-07-29): the TYPE is always shown — it's pure, never queried,
  // so it can't be wrong. The scope-label *lines* need a read (subject-grade names), so on failure
  // they degrade to absent — the same posture as the unread count degrading to 0. This omits detail,
  // it does not misstate: editing access is server-enforced and unaffected, and the type is unchanged
  // (an editor is a "Teacher" with or without the line). A "(unavailable)" placeholder would be
  // uglier and no more useful, so we show the type alone.
  const [unread, summary, forum, schoolName] = await Promise.all([
    countUnread(payload, user),
    resolveAccessSummary(payload, user).catch(() => ({
      typeLabel: userTypeLabel(user),
      lines: [],
    })),
    forumState(payload, user),
    schoolNameForRender(payload),
  ])
  return (
    <nav className="app-nav" aria-label="Primary">
      {watchNavigation && (
        // `useSearchParams` needs a Suspense boundary; it renders nothing either way.
        <React.Suspense fallback={null}>
          <NavigationFreshness rendered={{ forumEnabled: forum.enabled, unread: forum.unread }} />
        </React.Suspense>
      )}
      {/* eslint-disable @next/next/no-html-link-for-pages */}
      <a className="app-nav__link" href="/">
        Lessons
      </a>
      {forum.enabled && (
        <a className="app-nav__link" href="/discuss">
          Discuss
          {forum.unread && (
            <>
              <span className="app-nav__dot" aria-hidden="true" />
              <span className="visually-hidden"> (unread discussions)</span>
            </>
          )}
        </a>
      )}
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
        schoolName={<SchoolName name={schoolName} />}
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
async function countUnread(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: User,
): Promise<number> {
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

/** Is the forum on, and is anything unread for this user? Best-effort, like the message count: a failed
 *  unread query shows no dot rather than breaking navigation. */
async function forumState(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: User,
): Promise<{ enabled: boolean; unread: boolean }> {
  // `systemFlagsForRender` never throws (a failed read is "off"); only the unread query can.
  const { forumEnabled } = await systemFlagsForRender(payload)
  if (!forumEnabled) return { enabled: false, unread: false }
  return { enabled: true, unread: await hasUnread(payload, user.id).catch(() => false) }
}
