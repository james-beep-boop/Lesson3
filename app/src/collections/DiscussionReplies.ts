import type { CollectionConfig } from 'payload'

import {
  joinReplyAuthor,
  orderReply,
  rejectContentEdits,
  REPLY_CONTENT_FIELDS,
  stampReplyCreate,
} from '../hooks/discussions'
import {
  createdText,
  forumPosting,
  forumReading,
  MAX_BODY_LENGTH,
  postFields,
  serverWritten,
} from '../lib/discussions'

/**
 * Discussion replies — chronological, flat, never edited (`docs/DESIGN-discussions-2026-10-09.md` §16.4).
 *
 * Created through Payload's ordinary REST create (`POST /api/discussion-replies`). `seq` is assigned by
 * one `UPDATE … RETURNING` on the topic (`orderReply`), which also takes the topic's row lock — so replies
 * to one thread are totally ordered and a failed reply cannot advance the thread's activity. Replies are
 * removed only with their whole thread.
 */
export const DiscussionReplies: CollectionConfig = {
  slug: 'discussion-replies',
  admin: { hidden: true },
  access: {
    read: forumReading,
    create: forumPosting,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeValidate: [stampReplyCreate],
    beforeChange: [rejectContentEdits(REPLY_CONTENT_FIELDS), orderReply],
    afterChange: [joinReplyAuthor],
  },
  indexes: [
    { fields: ['topic', 'seq'], unique: true },
    { fields: ['author', 'submissionKey'], unique: true },
  ],
  fields: [
    {
      // Required, and NOT NULL in the database — which is why thread deletion removes replies first.
      name: 'topic',
      type: 'relationship',
      relationTo: 'discussion-topics',
      required: true,
      maxDepth: 0,
      index: true,
    },
    {
      // 1, 2, 3 … within the thread; 0 is the opening post. Assigned by `orderReply`.
      name: 'seq',
      type: 'number',
      required: true,
      access: serverWritten,
    },
    { name: 'body', type: 'textarea', validate: createdText('The reply', MAX_BODY_LENGTH) },
    ...postFields(),
    {
      // Transient input, never stored: the thread's `lastSeq` when the reply box's page was rendered —
      // where the author's unread tracking starts if this is their first post here (§16.4).
      name: 'joinedAtSeq',
      type: 'number',
      virtual: true,
    },
  ],
}
