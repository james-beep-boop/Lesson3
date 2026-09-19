import type { CollectionBeforeOperationHook, Payload, PayloadRequest } from 'payload'

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

/**
 * Payload's native first-register operation creates the user, sends the collection's verification
 * email, and only then marks that same user verified. The message is redundant and contradicts the
 * local-install promise that bootstrap needs no mail path.
 *
 * `disableVerificationEmail` is a create-operation argument, so set it in the collection's
 * beforeOperation seam rather than replacing Payload's transactional first-register endpoint. Both
 * predicates are deliberate: the route identifies bootstrap, while `overrideAccess` proves this is
 * Payload's trusted in-process create rather than an ordinary wire signup.
 */
export const suppressFirstUserVerificationEmail: CollectionBeforeOperationHook = ({
  args,
  operation,
  overrideAccess,
  req,
}) => {
  if (operation !== 'create' || !overrideAccess || !isFirstRegisterRequest(req)) return args
  return { ...args, disableVerificationEmail: true }
}
