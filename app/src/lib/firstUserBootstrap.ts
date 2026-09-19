import type { Payload, PayloadRequest } from 'payload'

/**
 * Whether this installation already has an account.
 *
 * The count deliberately bypasses collection access: callers are either server-rendered auth pages
 * or the users create gate itself. Passing the current request keeps the access check on the same
 * transaction/connection when Payload provides one.
 */
export async function hasRegisteredUsers(payload: Payload, req?: PayloadRequest): Promise<boolean> {
  const { totalDocs } = await payload.count({ collection: 'users', overrideAccess: true, req })
  return totalDocs > 0
}

/**
 * Is this request Payload's native one-shot bootstrap route (`POST /api/users/first-register`)?
 *
 * ⚑ ONE SPELLING, DELIBERATELY SHARED BY TWO SUBSYSTEMS. Both `hooks/authRateLimit` (which exempts
 * setup from the signup budget) and `hooks/userRoles` (which refuses the request that loses the
 * advisory-lock race) must agree on what counts as a bootstrap request, and they fail in OPPOSITE
 * directions if they ever disagree: the limiter starts charging setup, or the role hook stops
 * refusing a second registrant. Inlining `endsWith` in both — which is how this arrived — is a
 * silent carve-out failure waiting for the first person to tighten one copy.
 *
 * Same reasoning as `ADMIN_RESET_LINK_CONTEXT`: when two places must agree on a carve-out's
 * boundary, the boundary gets a name.
 */
export const isFirstRegisterRequest = (req: Pick<PayloadRequest, 'pathname'>): boolean =>
  req.pathname?.endsWith('/first-register') === true
