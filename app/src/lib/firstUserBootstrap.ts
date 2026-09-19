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
 * Used by `hooks/userRoles` to distinguish the one-shot bootstrap request while holding the
 * advisory lock. Signup throttling no longer depends on this URL: Payload's native first-register
 * operation carries `overrideAccess: true`, and `authRateLimit` classifies on that operation flag.
 */
export const isFirstRegisterRequest = (req: Pick<PayloadRequest, 'pathname'>): boolean =>
  req.pathname?.endsWith('/first-register') === true
