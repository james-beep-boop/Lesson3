/**
 * Messaging integration tests (§10 PR ③). Drives Payload's Local API with `overrideAccess: false`
 * + an explicit `user`, proving the collection's whole security model server-side:
 *
 *   - `sender` is STAMPED from the session on create — nobody sends on someone else's behalf.
 *   - Messages are PRIVATE: readable by sender + recipient only — deliberately NOT by Site Admin
 *     (unlike favorites; ops visibility is job rows + logs, never bodies).
 *   - There is NO API update or delete path for anyone (mark-read is a system write).
 *   - The notification hook enqueues a `messagePing` job ONLY when the recipient had zero other
 *     unread messages (the zero-unread gate), and creation spends the sender's daily budget.
 *   - Deleting a user cascades their messages, sent AND received (required rel = NOT NULL column).
 *
 * Also pins the names-only roster relaxation that lands with messaging (SPEC §8 as amended
 * 2026-07-02): any authenticated user reads other users' display names, but email / roles /
 * assignments stay field-stripped for non-admins.
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { relId } from '../../src/lib/relId.js'
import { consumeRateLimit } from '../../src/lib/rateLimit.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  if (!fx) return
  // Fixture users' rate counters would otherwise orphan (keys are `message:<userId>` etc.).
  const db = (fx.payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } })
    .drizzle
  for (const u of Object.values(fx.users)) {
    await db.execute(
      sql`DELETE FROM "rate_limit_counters" WHERE "bucket_key" IN (${`message:${u.id}`}, ${`messagePingRecipient:${u.id}`});`,
    )
  }
  await fx.teardown()
})

/** All messages rows visible to `user` (sender-or-recipient only). */
async function messagesVisibleTo(user: RoleFixture['users'][keyof RoleFixture['users']]) {
  const { docs } = await fx.payload.find({
    collection: 'messages',
    overrideAccess: false,
    user,
    depth: 0,
    pagination: false,
  })
  return docs
}

/** The messagePing job rows whose input names this message (retained after completion). */
async function pingJobsFor(messageId: number) {
  const { docs } = await fx.payload.find({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: 'messagePing' } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return docs.filter((j) => (j.input as { messageId?: number } | undefined)?.messageId === messageId)
}

const send = (from: RoleFixture['users'][keyof RoleFixture['users']], to: number, body: string) =>
  fx.payload.create({
    collection: 'messages',
    data: { sender: from.id, recipient: to, body },
    overrideAccess: false,
    user: from,
  })

describe('messages (§10): stamped sender, private rows, closed update/delete', () => {
  it('stamps `sender` from the session — a supplied foreign sender id is overridden', async () => {
    const msg = await fx.payload.create({
      collection: 'messages',
      data: { sender: fx.users.editor.id, recipient: fx.users.editor.id, body: `${MARK}hello` }, // hostile: send "as" the editor
      overrideAccess: false,
      user: fx.users.teacher,
    })
    expect(relId(msg.sender)).toBe(fx.users.teacher.id)
    expect(relId(msg.recipient)).toBe(fx.users.editor.id)
  })

  it('is readable by sender and recipient ONLY — not by a Subject Admin, not by the Site Admin', async () => {
    const [msg] = await messagesVisibleTo(fx.users.teacher)
    expect(msg).toBeTruthy()
    expect((await messagesVisibleTo(fx.users.editor)).map((m) => m.id)).toContain(msg.id)
    // Deliberate privacy call (DECISIONS 2026-07-02): messages are correspondence, no admin read.
    expect(await messagesVisibleTo(fx.users.subjectAdmin)).toHaveLength(0)
    expect(await messagesVisibleTo(fx.users.siteAdmin)).toHaveLength(0)
  })

  it('rejects updates and deletes for everyone — even participants, even the Site Admin', async () => {
    const [msg] = await messagesVisibleTo(fx.users.teacher)
    for (const user of [fx.users.teacher, fx.users.editor, fx.users.siteAdmin]) {
      await expect(
        fx.payload.update({
          collection: 'messages',
          id: msg.id,
          data: { readAt: new Date().toISOString() },
          overrideAccess: false,
          user,
        }),
      ).rejects.toThrow()
      await expect(
        fx.payload.delete({ collection: 'messages', id: msg.id, overrideAccess: false, user }),
      ).rejects.toThrow()
    }
  })
})

describe('notification ping (zero-unread gate + per-recipient budget)', () => {
  it('pings on the first unread, stays silent while unread remain, pings again after a read', async () => {
    // subjectAdmin as recipient: no earlier test messaged them, so they start at zero unread.
    const m1 = await send(fx.users.teacher, fx.users.subjectAdmin.id, `${MARK}ping-1`)
    expect(await pingJobsFor(m1.id)).toHaveLength(1)

    // m1 is still unread → the second message must NOT enqueue another ping.
    const m2 = await send(fx.users.teacher, fx.users.subjectAdmin.id, `${MARK}ping-2`)
    expect(await pingJobsFor(m2.id)).toHaveLength(0)

    // The inbox mark-read write (system path), then a third message pings again.
    await fx.payload.update({
      collection: 'messages',
      where: {
        and: [{ recipient: { equals: fx.users.subjectAdmin.id } }, { readAt: { exists: false } }],
      },
      data: { readAt: new Date().toISOString() },
      overrideAccess: true,
    })
    const m3 = await send(fx.users.teacher, fx.users.subjectAdmin.id, `${MARK}ping-3`)
    expect(await pingJobsFor(m3.id)).toHaveLength(1)
  })

  it('skips the ping (but keeps the message) when the recipient ping budget is exhausted', async () => {
    const req = { payload: fx.payload } as unknown as PayloadRequest
    const PING_MAX = Number(process.env.RATE_LIMIT_MESSAGE_PING_RECIPIENT_MAX) || 20
    // Drain the TEACHER's ping-recipient budget directly (cheap SQL, no 20 emails).
    for (let i = 0; i < PING_MAX; i++) {
      await consumeRateLimit(req, 'messagePingRecipient', String(fx.users.teacher.id))
    }
    const msg = await send(fx.users.editor, fx.users.teacher.id, `${MARK}ping-capped`)
    expect(await pingJobsFor(msg.id)).toHaveLength(0) // ping skipped…
    expect((await messagesVisibleTo(fx.users.teacher)).map((m) => m.id)).toContain(msg.id) // …message delivered
  })

  it('a ping enqueue FAILURE does not roll back the message create (best-effort ping)', async () => {
    // Codex audit 2026-07-03 #3: notifyRecipient wraps `jobs.queue` in try/catch, so a queue outage
    // must not fail the create. A fresh scratch recipient (zero unread) guarantees the zero-unread
    // gate passes, so the hook actually ATTEMPTS the enqueue — which we force to reject.
    const recipient = await fx.payload.create({
      collection: 'users',
      data: {
        name: `${MARK}PingFailRecipient`,
        email: `${MARK.toLowerCase()}pingfail@example.com`,
        password: fx.password,
      },
      overrideAccess: true,
    })
    const spy = vi.spyOn(fx.payload.jobs, 'queue').mockRejectedValue(new Error('queue down'))
    try {
      const msg = await send(fx.users.editor, recipient.id, `${MARK}queue-outage`)
      expect(spy).toHaveBeenCalled() // the enqueue path really fired (and was swallowed)
      expect((await messagesVisibleTo(recipient)).map((m) => m.id)).toContain(msg.id) // delivered anyway
    } finally {
      spy.mockRestore()
      // Cascade-deletes the scratch message with the user (NOT NULL FK).
      await fx.payload.delete({ collection: 'users', id: recipient.id, overrideAccess: true })
    }
  })

  it('enforces the sender daily cap — create rejects once the budget is spent', async () => {
    const req = { payload: fx.payload } as unknown as PayloadRequest
    const MESSAGE_MAX = Number(process.env.RATE_LIMIT_MESSAGE_MAX) || 50
    // Drain the SUBJECT ADMIN's send budget (a sender no other test uses), then one more create 429s.
    for (let i = 0; i < MESSAGE_MAX; i++) {
      await consumeRateLimit(req, 'message', String(fx.users.subjectAdmin.id))
    }
    await expect(
      send(fx.users.subjectAdmin, fx.users.teacher.id, `${MARK}over-budget`),
    ).rejects.toThrow(/Daily message limit/)
  })
})

describe('messages cascade with their users (NOT NULL FK → 23502 without it)', () => {
  it('deleting a user removes messages they sent AND messages they received', async () => {
    const scratch = await fx.payload.create({
      collection: 'users',
      data: {
        name: `${MARK}MsgCascadeUser`,
        email: `${MARK.toLowerCase()}msgcascade@example.com`,
        password: fx.password,
      },
      overrideAccess: true,
    })
    const sent = await send(scratch, fx.users.teacher.id, `${MARK}from-scratch`)
    const received = await send(fx.users.teacher, scratch.id, `${MARK}to-scratch`)

    await expect(
      fx.payload.delete({ collection: 'users', id: scratch.id, overrideAccess: true }),
    ).resolves.toBeTruthy()
    const { totalDocs } = await fx.payload.count({
      collection: 'messages',
      where: { id: { in: [sent.id, received.id] } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })
})

describe('names-only roster (SPEC §8 as amended with PR ③)', () => {
  it('a Teacher reads every user name, but email/roles/assignments are stripped', async () => {
    const { docs } = await fx.payload.find({
      collection: 'users',
      overrideAccess: false,
      user: fx.users.teacher,
      depth: 0,
      pagination: false,
    })
    const editor = docs.find((u) => u.id === fx.users.editor.id)
    const admin = docs.find((u) => u.id === fx.users.siteAdmin.id)
    expect(editor).toBeTruthy() // the roster is readable…
    expect(editor!.name).toBe(fx.users.editor.name)
    expect(editor!.email).toBeUndefined() // …but names only
    // hasMany/array fields strip to EMPTY containers (not undefined) under field read access —
    // the values that must not leak are the editor's assignment row and the admin's global role.
    expect(editor!.assignments ?? []).toHaveLength(0)
    expect(admin!.roles ?? []).toHaveLength(0)
  })

  it('role managers and the user themselves still read assignments', async () => {
    const asSubjectAdmin = await fx.payload.findByID({
      collection: 'users',
      id: fx.users.editor.id,
      overrideAccess: false,
      user: fx.users.subjectAdmin,
      depth: 0,
    })
    expect(asSubjectAdmin.assignments).toHaveLength(1)

    const asSelf = await fx.payload.findByID({
      collection: 'users',
      id: fx.users.editor.id,
      overrideAccess: false,
      user: fx.users.editor,
      depth: 0,
    })
    expect(asSelf.assignments).toHaveLength(1)
  })
})
