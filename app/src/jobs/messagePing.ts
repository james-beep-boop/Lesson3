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
      const recipient = (await req.payload.findByID({
        collection: 'users',
        id: recipientUserId,
        depth: 0,
        overrideAccess: true,
      })) as User

      // Same base-URL source as the password-reset email (Users auth config): ADMIN_URL, falling
      // back to SERVER_URL (deliberately '' on the internal host — the path alone still orients).
      const base = process.env.ADMIN_URL || process.env.SERVER_URL || ''
      await req.payload.sendEmail({
        to: recipient.email,
        subject: 'You have a new message — ARES Lesson Library',
        text:
          'You have a message waiting in the ARES Lesson Library.\n\n' +
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
