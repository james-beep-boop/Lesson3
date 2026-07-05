import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Where,
} from 'payload'
import { APIError } from 'payload'

import { consumeRateLimit } from '../lib/rateLimit'
import { relId } from '../lib/relId'
import { MESSAGE_PING_SLUG, type MessagePingInput } from '../jobs/messagePing'
import { markMessagesReadEndpoint } from '../endpoints/markMessagesRead'
import type { User } from '../payload-types'

/**
 * Internal messaging (SPEC §10) — any user may message any user. Flat, no threads: one row per
 * message, `readAt` null = unread. Deliberate shape decisions (DECISIONS 2026-07-02, PR ③ Q&A):
 *
 *  - Created from The App via Payload's default REST (POST /api/messages) — Payload-first, no
 *    custom endpoint. `sender` is STAMPED server-side from the session (same spoof-proofing as
 *    favorites); creation is rate-limited per sender (daily 'message' bucket) in beforeValidate.
 *  - PRIVATE correspondence: read = sender or recipient ONLY — deliberately NO Site Admin
 *    exception (unlike favorites). Ops visibility comes from the ping job rows + structured logs,
 *    not from reading bodies.
 *  - NO update or delete via the API at all. Mark-as-read is a system write (overrideAccess) by
 *    the inbox page when the recipient views their messages; there is no user delete path in this
 *    iteration (flat single-row model means delete-for-one would delete for both).
 *  - Notification = in-app unread badge + a CONTENT-FREE email ping (afterChange → Jobs Queue),
 *    sent only when the recipient had zero other unread messages (a burst of messages while they
 *    are away emails once, not N times) and bounded per recipient by 'messagePingRecipient'.
 *
 * Parent deletions: sender/recipient are required (NOT NULL cols with ON DELETE SET NULL FKs), so
 * user deletion must cascade-delete their messages first — same 23502 trap as favorites. The
 * optional lessonPlan/version links are nullable, so those FKs' SET NULL just clears the link.
 */

/** Sender or recipient only — messages are private (no Site Admin read; see header comment). */
const senderOrRecipient: Access = ({ req: { user } }) => {
  const u = user as User | null
  if (!u) return false
  const ownRows: Where = { or: [{ sender: { equals: u.id } }, { recipient: { equals: u.id } }] }
  return ownRows
}

/** Stamp `sender` from the session on authenticated creates (spoofed ids overridden) and spend the
 *  sender's daily message budget. System paths (overrideAccess, no `req.user` — fixtures, tests)
 *  supply `sender` explicitly and are not rate-limited. beforeValidate, so a REST POST that omits
 *  `sender` still passes the required-field check. */
const stampSenderAndRateLimit: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !req.user) return data
  const { ok, retryAfterSec } = await consumeRateLimit(req, 'message', String(req.user.id))
  if (!ok) {
    throw new APIError(
      `Daily message limit reached — please wait ${retryAfterSec}s and try again.`,
      429,
    )
  }
  return { ...data, sender: req.user.id }
}

/** beforeValidate (create): keep the optional context link internally consistent. `POST /api/messages`
 *  is open, so — even though the Composer always sends a matching pair — a crafted request could
 *  attach Plan A with a `version` that belongs to Plan B. The inbox would then silently fall back to
 *  A's Official version, HIDING the mismatch rather than surfacing it. Enforce it server-side: a
 *  linked version must belong to the linked plan (and the sender must be able to read it). System
 *  paths (no `req.user` — fixtures/tests) are trusted. */
const validateContextLink: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !req.user || data?.version == null) return data
  if (data.lessonPlan == null) {
    throw new APIError('A linked lesson version must include its lesson plan.', 400)
  }
  const version = await req.payload
    .findByID({
      collection: 'lesson-bundle-versions',
      id: data.version as number | string,
      depth: 0,
      overrideAccess: false,
      user: req.user,
    })
    .catch(() => null)
  if (!version || relId(version.lessonPlan) !== relId(data.lessonPlan)) {
    throw new APIError('A linked lesson version must belong to the linked lesson plan.', 400)
  }
  return data
}

/** afterChange (create): enqueue the content-free email ping for the recipient — but only when
 *  this message is their ONLY unread one (zero-unread gate), and only within the per-recipient
 *  daily ping budget. Both gates SKIP the ping, never fail the message. Runs on `req`, so the
 *  enqueue rides the create's transaction (a rolled-back message pings nobody). */
const notifyRecipient: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return
  const recipientId = relId(doc.recipient)
  const senderId = relId(doc.sender)
  if (recipientId == null) return

  const otherUnread = await req.payload.count({
    collection: 'messages',
    where: {
      and: [
        { recipient: { equals: recipientId } },
        { readAt: { exists: false } },
        { id: { not_equals: doc.id } },
      ],
    },
    overrideAccess: true,
    req,
  })
  if (otherUnread.totalDocs > 0) return

  const { ok } = await consumeRateLimit(req, 'messagePingRecipient', String(recipientId))
  if (!ok) {
    req.payload.logger.info(
      { messageId: doc.id, recipientUserId: recipientId, senderUserId: senderId },
      'messagePing skipped: recipient daily ping limit reached',
    )
    return
  }

  const input: MessagePingInput = {
    messageId: Number(doc.id),
    recipientUserId: recipientId,
    // Egress attribution (the email-hardening rule): the sender id lives on the retained
    // payload-jobs row and in the task's logs, even though the email itself names nobody.
    senderUserId: senderId ?? 0,
  }
  // Best-effort by contract: the reliable delivery path is the in-app message row, so a failure to
  // ENQUEUE the ping must never fail the create. This afterChange runs on the create's transaction,
  // so an unguarded throw here would roll the message back (Codex audit 2026-07-03). Swallow + log.
  try {
    await req.payload.jobs.queue({ task: MESSAGE_PING_SLUG, input, req })
  } catch (err) {
    req.payload.logger.error(
      { err, messageId: doc.id, recipientUserId: recipientId, senderUserId: senderId },
      'messagePing enqueue failed (message delivered; ping skipped)',
    )
  }
}

/** beforeDelete on `users`: a user's messages (sent AND received) go with them — required rels
 *  mean NOT NULL columns, so leaving rows behind 23502s (see collections/Favorites). */
export const cascadeDeleteUserMessages: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'messages',
    where: { or: [{ sender: { equals: id } }, { recipient: { equals: id } }] },
    overrideAccess: true,
    req,
  })
}

export const Messages: CollectionConfig = {
  slug: 'messages',
  admin: {
    hidden: true,
  },
  access: {
    read: senderOrRecipient,
    create: ({ req: { user } }) => Boolean(user),
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeValidate: [stampSenderAndRateLimit, validateContextLink],
    afterChange: [notifyRecipient],
  },
  endpoints: [
    // POST /:? — mark-read is a state-changing POST (not the former GET-render write), CSRF-safe by
    // the SameSite=Lax cookie; scoped server-side to the caller's own messages. See markMessagesRead.
    markMessagesReadEndpoint,
  ],
  fields: [
    {
      name: 'sender',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'recipient',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      // Plain text, same grammar as everywhere else (no inline markup); rendered as text, never
      // HTML. The cap bounds storage and the inbox render, not expression — it's a note, not a doc.
      name: 'body',
      type: 'textarea',
      required: true,
      maxLength: 5000,
    },
    {
      // Optional context links ("about this lesson"). Nullable FKs: deleting the plan/version
      // clears the link (SET NULL), the message itself survives.
      name: 'lessonPlan',
      type: 'relationship',
      relationTo: 'lesson-plans',
    },
    {
      name: 'version',
      type: 'relationship',
      relationTo: 'lesson-bundle-versions',
    },
    {
      // null = unread. Set ONLY by the system mark-read write (inbox view); API update is closed.
      name: 'readAt',
      type: 'date',
    },
  ],
}
