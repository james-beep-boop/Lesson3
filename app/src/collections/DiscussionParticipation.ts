import type { CollectionBeforeDeleteHook, CollectionConfig } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { ownParticipation } from '../lib/discussions'
import { lockRows, rowsOf, txDb } from '../lib/txDb'

/**
 * Discussion participation — who follows which thread, and how far they have read
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.4).
 *
 * One row per (user, topic). Written only by the system: `insertParticipation` (lib/discussions.ts) on
 * posting, and mark-read (3b). `lastReadSeq` is the seq of the last reply read; −1 means the opening
 * post itself is unread (an invited version author).
 */
export const DiscussionParticipation: CollectionConfig = {
  slug: 'discussion-participation',
  admin: { hidden: true },
  access: {
    read: ownParticipation,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  indexes: [{ fields: ['user', 'topic'], unique: true }],
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      maxDepth: 0,
      index: true,
    },
    {
      name: 'topic',
      type: 'relationship',
      relationTo: 'discussion-topics',
      required: true,
      maxDepth: 0,
      index: true,
    },
    { name: 'lastReadSeq', type: 'number', required: true },
  ],
}

/**
 * beforeDelete on `users`: remove the account's participation rows — personal state, with a NOT NULL
 * user column (the Favorites/Messages 23502 trap). Their POSTS are never touched: `author` is optional,
 * so the delete clears it and the post shows "Deleted User".
 *
 * `lockDeletingUser` has already locked the account, blocking new references to it. Lock every affected
 * topic before removing participation: the eventual user DELETE also clears author and moderation FKs.
 * Otherwise this cascade can hold participation while waiting for a topic, and whole-thread deletion
 * holds that topic while waiting for the same participation — a deadlock. Include reply authors and
 * moderation provenance even when the departing account never authored the opening post.
 */
export const cascadeDeleteUserParticipation: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const db = await txDb(req, { requireTransaction: true })
  const topics = rowsOf(
    await db.execute(sql`
      SELECT id FROM discussion_topics
       WHERE author_id = ${id} OR redacted_by_id = ${id} OR title_redacted_by_id = ${id}
      UNION SELECT topic_id AS id FROM discussion_replies
       WHERE author_id = ${id} OR redacted_by_id = ${id}
      UNION SELECT topic_id AS id FROM discussion_participation WHERE user_id = ${id}
    `),
  )
  await lockRows(
    req,
    'discussion_topics',
    topics.map((topic) => Number(topic.id)),
  )
  await req.payload.delete({
    collection: 'discussion-participation',
    where: { user: { equals: id } },
    overrideAccess: true,
    req,
  })
}
