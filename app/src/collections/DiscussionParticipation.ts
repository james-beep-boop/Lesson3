import type { CollectionBeforeDeleteHook, CollectionConfig } from 'payload'

import { ownParticipation } from '../lib/discussions'

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
 * Coordination with concurrent posting is not this hook's job: `lockDeletingUser` (hooks/userRoles.ts)
 * has already taken the account's row lock, and `insertParticipation` waits on it.
 */
export const cascadeDeleteUserParticipation: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'discussion-participation',
    where: { user: { equals: id } },
    overrideAccess: true,
    req,
  })
}
