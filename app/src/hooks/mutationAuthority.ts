import type { CollectionBeforeOperationHook } from 'payload'

import { refreshCaller } from '../endpoints/respond'
import { findReadableVersion } from '../lib/readBundle'
import { relId } from '../lib/relId'
import { lockRows, takeAdvisoryLock } from '../lib/txDb'
import type { User } from '../payload-types'

/**
 * Native user/plan PATCH and user/plan/version DELETE must wait BEFORE Payload reads the target and
 * evaluates collection/field access. Otherwise they can pass those checks and then wait on an
 * invariant's lock while the caller's authority is revoked. The shared administrator lock also
 * prevents normal account/assignment revocations during later waits in these native operations.
 * Trusted Local API operations keep their own authorization contract.
 *
 * Installed Payload starts the transaction before beforeOperation, then runs access and reads the
 * document afterwards. The shared administrator lock also serializes bulk writes (no args.id).
 */
export const refreshMutationAuthority: CollectionBeforeOperationHook = async ({
  args,
  collection,
  operation,
  overrideAccess,
  req,
}) => {
  if (overrideAccess || !req.user || (operation !== 'update' && operation !== 'delete')) return args
  // Authenticated in-place version updates are unconditionally refused by immutability already.
  if (collection.slug === 'lesson-bundle-versions' && operation !== 'delete') return args
  await takeAdvisoryLock(req, 'adminCount')
  const id = 'id' in args ? relId(args.id) : null
  if (id !== null) {
    if (collection.slug === 'users') await lockRows(req, 'users', [id])
    else if (collection.slug === 'lesson-plans') await lockRows(req, 'lesson_plans', [id])
    else if (collection.slug === 'lesson-bundle-versions') {
      const version = await findReadableVersion(req.payload, {
        id,
        user: req.user as User,
        req,
        select: { lessonPlan: true },
      })
      const planId = relId(version?.lessonPlan)
      if (planId !== null) await lockRows(req, 'lesson_plans', [planId])
    }
  }
  await refreshCaller(req)
  return args
}
