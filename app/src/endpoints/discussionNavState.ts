/**
 * `GET /api/discussion-topics/nav-state` → `{ forumEnabled, unread }` for the signed-in caller: exactly
 * what the shared navigation shows (the Discuss item and its dot), and nothing else.
 *
 * ⚑ WHY IT EXISTS (review of #380, 2026-10-11). Next keeps the frontend layout across soft navigations,
 * so the header's Discuss item could outlive a switch-off, and a Back could restore a cached page that
 * still offered "Discuss this version". #380 fixed that by calling `router.refresh()` after EVERY soft
 * URL change, which re-renders the whole destination route on the server each time. The navigation now
 * asks this endpoint instead, and refreshes the route only when the answer differs from what the page was
 * rendered with (`components/AppNav/NavigationFreshness.tsx`). Switch-off and new unread posts still
 * reach the page on the next navigation; ordinary browsing costs one small query.
 *
 * The switch is read afresh per request (`isForumEnabled`), never from a cross-request cache. While the
 * forum is off the answer is `{ forumEnabled: false, unread: false }` for everyone, the Site Administrator
 * included: the nav item is absent while off (§16.4), and moderation is reached from Manage → System.
 * The unread query is best-effort, like the nav's own: a failure answers `false` rather than an error.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { hasUnread } from '../lib/discussions'
import { isForumEnabled } from '../lib/systemFlags'
import type { User } from '../payload-types'
import { json } from './respond'

export const navStateEndpoint: Endpoint = {
  path: '/nav-state',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const forumEnabled = await isForumEnabled(req)
    const unread = forumEnabled
      ? await hasUnread(req.payload, (req.user as User).id).catch(() => false)
      : false
    // Per-user and changing: never let a cache answer for it.
    return json({ forumEnabled, unread }, 200, { 'Cache-Control': 'no-store' })
  },
}
