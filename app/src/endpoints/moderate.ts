/**
 * The one path every forum moderation write takes — whole-thread deletion, pinning and both redactions
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.5). Shared so they cannot drift on lock order, the
 * re-check, or what the log line means.
 */
import { sql } from '@payloadcms/db-postgres'
import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from 'payload'

import { relId } from '../lib/relId'
import { lockRows, lockUserForReference, rowsOf, txDb } from '../lib/txDb'
import type { User } from '../payload-types'
import { assertSiteAdmin, reassertSiteAdmin } from './respond'

export type Db = Awaited<ReturnType<typeof txDb>>

/** The moderated post: a topic or a reply, by id. */
export interface ModerationTarget {
  table: 'discussion_topics' | 'discussion_replies'
  id: number
}

/** One moderation action: its log event, the post it acts on, and whether its write stamps the actor. */
export interface Moderation {
  event: string
  target: ModerationTarget
  /** The write references the administrator (`redacted_by_id`), so their user row is locked first. */
  stampsActor: boolean
}

/** The `:id` route parameter, or 400. */
export const routeId = (req: PayloadRequest): number => {
  const id = relId(req.routeParams?.id)
  if (id == null) throw new APIError('Missing discussion id', 400)
  return id
}

/**
 * Run one moderation write as the Site Administrator, in a transaction this request owns. In order:
 *
 *   1. when the write stamps the actor (redaction's `redacted_by_id`): `FOR KEY SHARE` on the
 *      administrator's user row — lock order user, then post (DECISIONS 2026-10-09). The foreign key
 *      takes this lock implicitly; taken after the post's lock it formed a cycle with the deletion of the
 *      administrator's own account (40P01);
 *   2. `FOR UPDATE` on the target post, which may WAIT (a reply or another moderator holding it). It
 *      comes before anything READS the post: `payload.update` reads, then writes the whole document back,
 *      so a read taken before this lock can write stale values over a concurrent change;
 *   3. RE-CHECK that the caller is still a usable Site Administrator — after every wait, because a
 *      demotion, disable or deletion may have committed meanwhile (#374, #376);
 *   4. `write`, then commit — and only then the log line, so it means "committed". Payload's after-hooks
 *      run before the commit, which is why these are endpoints and not REST writes.
 *
 * ⚑ STEP 1 ONLY WHEN NEEDED — NOT "ALWAYS, TO BE SAFE". Demoting, disabling or deleting an account takes
 * `FOR UPDATE` on its row, which conflicts with `FOR KEY SHARE`. Held through the post wait, it makes
 * that change queue behind the moderation instead of committing during the wait, so the re-check never
 * sees it. That is still safe (the moderation simply happened first), but it is a different contract,
 * and thread deletion and pinning write no user reference, so they do not need the lock. They keep #376's
 * contract, pinned over HTTP: a change committed during the wait is refused. Redaction must take the
 * lock, so for redaction a concurrent change to the administrator's account waits for it instead.
 *
 * ⚑ HOOKS DIFFER BY ACTION. Redaction is raw SQL, so it fires no collection hooks at all. Pinning
 * (`payload.update`) and deletion (`payload.delete`) do fire them, inside this transaction and BEFORE the
 * commit: the topic's `afterChange` (which acts only on create) and `beforeDelete` (the cascade). So no
 * hook can mean "committed". Anything that must follow a moderation write, such as a cache invalidation,
 * belongs after `commitTransaction` below, where it runs for every action alike.
 */
export async function moderate(
  req: PayloadRequest,
  { event, target, stampsActor }: Moderation,
  write: (db: Db, adminId: number) => Promise<Record<string, unknown>>,
): Promise<void> {
  assertSiteAdmin(req)
  const adminId = (req.user as User).id
  const shouldCommit = await initTransaction(req)
  if (!shouldCommit) {
    throw new Error(`${event} must own its transaction; refusing to run inside another`)
  }
  let logFields: Record<string, unknown>
  try {
    if (stampsActor && !(await lockUserForReference(req, adminId))) {
      throw new APIError('Forbidden', 403)
    }
    await lockRows(req, target.table, [target.id])
    await reassertSiteAdmin(req)
    logFields = await write(await txDb(req, { requireTransaction: true }), adminId)
    await commitTransaction(req)
  } catch (e) {
    await killTransaction(req)
    throw e
  }
  req.payload.logger.info({ event, actorUserId: adminId, ...logFields }, event.replaceAll('_', ' '))
}

/**
 * Zero rows from a conditional write means the post is gone (404) or it was already redacted (409) —
 * tell them apart with one look, inside the same transaction.
 */
export async function noRowsReason(db: Db, { table, id }: ModerationTarget): Promise<APIError> {
  const [exists] = rowsOf(
    await db.execute(sql`SELECT 1 FROM ${sql.raw(`"${table}"`)} WHERE "id" = ${id}`),
  )
  return exists
    ? new APIError('Already removed by the administrator.', 409)
    : new APIError('This discussion no longer exists.', 404)
}
