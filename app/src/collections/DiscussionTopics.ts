import type { CollectionConfig } from 'payload'

import { markReadEndpoint, pinEndpoint, redactTopicEndpoint } from '../endpoints/discussionActions'
import { deleteThreadEndpoint } from '../endpoints/discussionThreadDelete'
import {
  cascadeDeleteThread,
  joinTopicParticipants,
  rejectContentEdits,
  stampTopicCreate,
  TOPIC_CONTENT_FIELDS,
} from '../hooks/discussions'
import {
  createdText,
  forumPosting,
  forumReading,
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  postFields,
  serverWritten,
} from '../lib/discussions'

/**
 * Discussion topics — the opening post of each thread (`docs/DESIGN-discussions-2026-10-09.md` §16.4).
 *
 * Created through Payload's ordinary REST create (`POST /api/discussion-topics`), exactly like Messages.
 * Nothing about a published topic can be edited by anyone. The only later writes are system ones:
 * activity on each reply and pinning, which `rejectContentEdits` confines to system fields; and redaction,
 * a conditional SQL update that never passes through that guard (endpoints/discussionActions.ts).
 * Whole-thread deletion and redaction are Site-Administrator ENDPOINTS, not REST writes, so their log
 * can mean "committed" (§16.5 contract, item 5; endpoints/moderate.ts).
 *
 * ⚑ ANY `payload.update` OF A TOPIC MUST HOLD THE TOPIC'S ROW LOCK FIRST. Payload reads the document and
 * writes it back whole, so an update that reads outside the lock overwrites a concurrent reply's `lastSeq`
 * or a redaction with the older values (review 2026-10-10, found on pinning). Today the only such write is
 * pinning, which runs inside `moderate`; replies and redaction are single SQL statements.
 */
export const DiscussionTopics: CollectionConfig = {
  slug: 'discussion-topics',
  admin: { hidden: true },
  access: {
    read: forumReading,
    create: forumPosting,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeValidate: [stampTopicCreate],
    beforeChange: [rejectContentEdits(TOPIC_CONTENT_FIELDS)],
    afterChange: [joinTopicParticipants],
    beforeDelete: [cascadeDeleteThread],
  },
  endpoints: [deleteThreadEndpoint, markReadEndpoint, pinEndpoint, redactTopicEndpoint],
  // One post per composer submission (contract item 1). NULL authors (deleted accounts) never collide.
  indexes: [{ fields: ['author', 'submissionKey'], unique: true }],
  fields: [
    { name: 'title', type: 'text', validate: createdText('A title', MAX_TITLE_LENGTH) },
    {
      // Plain text: `\n` separates paragraphs; rendered as text, never as HTML.
      name: 'body',
      type: 'textarea',
      validate: createdText('The post', MAX_BODY_LENGTH),
    },
    ...postFields(),
    { name: 'pinnedAt', type: 'date', index: true, access: serverWritten },
    {
      name: 'lastActivityAt',
      type: 'date',
      index: true,
      access: serverWritten,
      // Creation is the first activity; each reply then advances it (hooks/discussions.ts `orderReply`).
      defaultValue: () => new Date().toISOString(),
    },
    {
      // The seq of the newest reply — and therefore the reply count, since replies are only ever
      // removed with their whole thread. A separate counter would be a second copy that could drift.
      name: 'lastSeq',
      type: 'number',
      defaultValue: 0,
      access: serverWritten,
    },
    { name: 'titleRedactedAt', type: 'date', access: serverWritten },
    {
      name: 'titleRedactedBy',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      access: serverWritten,
    },
  ],
}
