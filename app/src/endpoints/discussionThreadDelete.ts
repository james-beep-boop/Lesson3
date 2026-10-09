/**
 * Whole-thread deletion — `POST /api/discussion-topics/:id/delete`
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.5, 3a contract item 5).
 *
 * Site Administrator only, whether the forum is on or off: deletion is one of the moderation actions the
 * Site Administrator keeps while it is off (§16.1). Every other caller is refused, and the collection's
 * REST `DELETE` is closed, so this is the only way a topic goes.
 *
 * ⚑ AN ENDPOINT, NOT THE REST DELETE, BECAUSE OF THE LOG. Nothing about a deleted thread survives in the
 * data, so the audit record is a structured log line — and it must mean the deletion COMMITTED. Payload's
 * `afterDelete` and `afterOperation` hooks both run before the commit (verified in the installed
 * `collections/operations/deleteByID.js`), so a line written from either could describe a deletion that
 * then rolled back. Here the transaction is ours: delete, commit, and only then log.
 *
 * The cascade itself (replies, participation) is `cascadeDeleteThread`, the topic's `beforeDelete`, which
 * takes the same topic lock replies take — so a reply racing this delete either commits first and is
 * removed with the thread, or finds the topic gone and fails cleanly.
 */
import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type Endpoint,
  type PayloadRequest,
} from 'payload'

import { isSiteAdmin } from '../access'
import { relId } from '../lib/relId'
import { lockRows } from '../lib/txDb'
import type { User } from '../payload-types'
import { assertSiteAdmin, json } from './respond'

export const deleteThreadEndpoint: Endpoint = {
  path: '/:id/delete',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    assertSiteAdmin(req)
    const topicId = relId(req.routeParams?.id)
    if (topicId == null) throw new APIError('Missing discussion id', 400)

    let replyCount: number
    // ⚑ This endpoint must OWN its transaction: the log below claims a committed deletion, which is only
    // true if the commit is ours. Payload gives a REST endpoint a fresh request, so this never fires in
    // practice; if a caller ever ran it inside an existing transaction, refusing beats a false log line.
    const shouldCommit = await initTransaction(req)
    if (!shouldCommit) {
      throw new Error(
        'discussion thread delete must own its transaction; refusing to run inside another',
      )
    }
    try {
      // Lock first, so the reply count read below cannot be overtaken by a reply before the delete.
      await lockRows(req, 'discussion_topics', [topicId])
      // Authentication is a snapshot: privileges may have changed while waiting for the topic.
      const caller = await req.payload.findByID({
        collection: 'users',
        id: (req.user as User).id,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        req,
      })
      if (!isSiteAdmin(caller) || caller?.signInDisabled) throw new APIError('Forbidden', 403)
      const topic = await req.payload.findByID({
        collection: 'discussion-topics',
        id: topicId,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        select: { lastSeq: true },
        req,
      })
      if (!topic) throw new APIError('This discussion no longer exists.', 404)
      replyCount = Number(topic.lastSeq ?? 0) // `lastSeq` IS the reply count (collections/DiscussionTopics)

      await req.payload.delete({
        collection: 'discussion-topics',
        id: topicId,
        overrideAccess: true,
        req,
      })
      await commitTransaction(req)
    } catch (e) {
      await killTransaction(req)
      throw e
    }

    // After the commit, so this line records a deletion that happened.
    req.payload.logger.info(
      {
        event: 'discussion_thread_deleted',
        actorUserId: (req.user as User).id,
        topicId,
        replyCount,
      },
      'discussion thread deleted',
    )
    return json({ ok: true })
  },
}
