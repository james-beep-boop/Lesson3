import type { Payload, PayloadRequest } from 'payload'

/**
 * Whether this installation already has an account.
 *
 * The count deliberately bypasses collection access: callers are either server-rendered auth pages
 * or the users create gate itself. Passing the current request keeps the access check on the same
 * transaction/connection when Payload provides one.
 */
export async function hasRegisteredUsers(payload: Payload, req?: PayloadRequest): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: 'users',
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  return totalDocs > 0
}
