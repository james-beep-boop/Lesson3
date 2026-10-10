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
 * then rolled back.
 *
 * It runs through `moderate` (endpoints/moderate.ts), shared with redaction: the transaction is
 * ours; the topic lock is taken and may wait (no lock on the administrator's own row — it writes no
 * reference to them); the caller's permissions are re-checked AFTER that wait (#376); then the
 * delete, the commit, and only then the log.
 *
 * The cascade itself (replies, participation) is `cascadeDeleteThread`, the topic's `beforeDelete`, which
 * takes the same topic lock replies take — so a reply racing this delete either commits first and is
 * removed with the thread, or finds the topic gone and fails cleanly.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { moderate, routeId } from './moderate'
import { assertSiteAdmin, json } from './respond'

export const deleteThreadEndpoint: Endpoint = {
  path: '/:id/delete',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    assertSiteAdmin(req)
    const topicId = routeId(req)

    // `stampsActor: false` — deletion writes no user reference, so it takes no lock on the caller's row
    // and a demotion committed during the topic wait is refused by the re-check (endpoints/moderate.ts).
    const action = {
      event: 'discussion_thread_deleted',
      target: { table: 'discussion_topics', id: topicId },
      stampsActor: false,
    } as const
    await moderate(req, action, async () => {
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
      await req.payload.delete({
        collection: 'discussion-topics',
        id: topicId,
        overrideAccess: true,
        req,
      })
      // `lastSeq` IS the reply count (collections/DiscussionTopics).
      return { topicId, replyCount: Number(topic.lastSeq ?? 0) }
    })
    return json({ ok: true })
  },
}
