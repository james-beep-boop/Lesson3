/**
 * `messagePing` task (SPEC §10 messaging notifications) — the CONTENT-FREE email ping: tells a
 * user they have a message waiting in the Lesson Library, and nothing else. No message body, no
 * sender name, no lesson reference — nothing sender-controlled reaches the email (the egress
 * lesson from email-a-doc hardening, DECISIONS 2026-07-02). The recipient is always a registered
 * user (their account email), never an arbitrary address.
 *
 * The enqueueing hook (collections/Messages `notifyRecipient`) already applied the zero-unread
 * gate and the per-recipient ping budget; this task just resolves the recipient's email and sends.
 *
 * Failure model matches emailVersionArtifact: `retries: 0`, a failed send stays failed (logged
 * with context + retained on the payload-jobs row). The in-app unread badge is the reliable
 * notification path; the ping is best-effort.
 */
import type { TaskConfig } from 'payload'

import { captureException } from '../lib/errorTracking'
import { emailLinkBase } from '../lib/emailLinkBase'
import type { User } from '../payload-types'

export interface MessagePingInput {
  messageId: number
  recipientUserId: number
  /** Sender's user id — egress attribution on the retained job row + logs (never in the email). */
  senderUserId: number
}

export const MESSAGE_PING_SLUG = 'messagePing' as const

export const messagePingTask: TaskConfig<{
  input: MessagePingInput
  output: object
}> = {
  slug: MESSAGE_PING_SLUG,
  retries: 0,
  inputSchema: [
    { name: 'messageId', type: 'number', required: true },
    { name: 'recipientUserId', type: 'number', required: true },
    { name: 'senderUserId', type: 'number', required: true },
  ],
  handler: async ({ input, req }) => {
    const { messageId, recipientUserId, senderUserId } = input
    try {
      // The ping is enqueued OUTSIDE the message-create transaction (see Messages.ts), which is what
      // stops a failed enqueue from rolling the message back. The cost is that this job can outlive
      // a create that later rolled back for an unrelated reason — so confirm the message is really
      // there before announcing it. Telling someone they have a new message that does not exist is
      // worse than sending nothing. A no-op, not a failure: there is nothing to retry.
      const stillExists = await req.payload
        .count({
          collection: 'messages',
          where: { id: { equals: messageId } },
          overrideAccess: true,
        })
        .then(({ totalDocs }) => totalDocs > 0)
      if (!stillExists) {
        req.payload.logger.info(
          { messageId, recipientUserId },
          'messagePing skipped — message no longer exists (create rolled back after enqueue)',
        )
        return { output: {} }
      }

      const recipient = (await req.payload.findByID({
        collection: 'users',
        id: recipientUserId,
        depth: 0,
        overrideAccess: true,
      })) as User

      // Shared email-link base (lib/emailLinkBase) — '' on the internal host, where the path
      // alone still orients.
      const base = emailLinkBase()
      await req.payload.sendEmail({
        to: recipient.email,
        subject: 'You have a new message — ARES Lesson Plans',
        text:
          'You have a message waiting in ARES Lesson Plans.\n\n' +
          `Sign in to read it: ${base}/messages`,
      })
      req.payload.logger.info(
        { messageId, recipientUserId, senderUserId },
        'messagePing sent',
      )
      return { output: {} }
    } catch (err) {
      req.payload.logger.error(
        { err, messageId, recipientUserId, senderUserId },
        'messagePing failed',
      )
      captureException(err, { job: 'messagePing', messageId, recipientUserId, senderUserId })
      throw err
    }
  },
}
