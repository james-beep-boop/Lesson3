/**
 * Discussions 3b — mark-read, pin, redaction, the unread queries and title search, against a real
 * database (`docs/DESIGN-discussions-2026-10-09.md` §16.4–16.5).
 *
 * The endpoints are driven through their real handlers with a Local request AS the user, so their own
 * gates run. The wire-level matrix (anonymous, each role) is `tests/http/discussions.http.spec.ts`.
 *
 * ⚑ THE FORUM IS SWITCHED ON EXPLICITLY — this database is built by `push`, so the settings row the
 * migration inserts does not exist, and an absent row reads as OFF (see discussions.int.spec.ts).
 *
 * Requires a DB (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, type Endpoint } from 'payload'

import {
  createUserVerified,
  MARK,
  minimalBundleContent,
  setForumEnabled,
  withForumOff,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import { clearRateLimitBuckets, drizzleOf, rowsOf } from '../helpers/db.js'
import { stillPendingAfterWindow, whileLockHeld, whileRowLocked } from '../helpers/rowLocks.js'
import {
  markReadEndpoint,
  pinEndpoint,
  redactReplyEndpoint,
  redactTopicEndpoint,
} from '../../src/endpoints/discussionActions.js'
import { hasUnread, searchTopicTitles, unreadTopicIds } from '../../src/lib/discussions.js'
import type { DiscussionTopic, LessonBundleVersion, User } from '../../src/payload-types.js'

let fx: RoleFixture
let keyCounter = 0
const newKey = () => `${crypto.randomUUID()}-${++keyCounter}`
const setForum = (on: boolean) => setForumEnabled(fx.payload, on)

async function createTopic(user: User, data: Record<string, unknown> = {}) {
  return (await fx.payload.create({
    collection: 'discussion-topics',
    data: {
      title: `${MARK}Topic`,
      body: 'Opening post',
      submissionKey: newKey(),
      ...data,
    } as never,
    overrideAccess: false,
    user,
  })) as DiscussionTopic
}

async function createReply(user: User, topicId: number, joinedAtSeq = 0) {
  return fx.payload.create({
    collection: 'discussion-replies',
    data: { topic: topicId, body: 'A reply', submissionKey: newKey(), joinedAtSeq } as never,
    overrideAccess: false,
    user,
  })
}

/** Call an endpoint handler as `user`, the way a request would reach it. */
async function call(endpoint: Endpoint, user: User | null, id: number, body: unknown = {}) {
  const req = await createLocalReq({ user: user ?? undefined }, fx.payload)
  Object.assign(req, {
    user,
    routeParams: { id: String(id) },
    headers: new Headers(),
    json: async () => body,
  })
  return endpoint.handler(req)
}

/** The endpoint's status: its Response's, or the status of the error it threw. */
async function statusOf(promise: Promise<Response>): Promise<number> {
  try {
    return (await promise).status
  } catch (e) {
    return (e as { status?: number }).status ?? 500
  }
}

const lastReadSeq = async (userId: number, topicId: number): Promise<number | null> => {
  const [row] = rowsOf<{ last_read_seq: string }>(
    await drizzleOf(fx.payload).execute(
      sql`SELECT last_read_seq FROM discussion_participation WHERE user_id = ${userId} AND topic_id = ${topicId}`,
    ),
  )
  return row ? Number(row.last_read_seq) : null
}

const topicById = (id: number) =>
  fx.payload.findByID({
    collection: 'discussion-topics',
    id,
    depth: 0,
    overrideAccess: true,
  }) as Promise<DiscussionTopic>

const markedUser = (label: string, extra: Pick<User, 'roles'> | object = {}) =>
  createUserVerified(fx.payload, {
    email: `${MARK}${label}@example.test`.toLowerCase(),
    name: `${MARK}${label}`,
    password: fx.password,
    ...extra,
  })

beforeAll(async () => {
  fx = await setupRoleFixture()
  await setForum(true)
}, 60_000)

afterAll(async () => {
  if (fx) {
    await setForum(true)
    for (const user of Object.values(fx.users)) {
      await clearRateLimitBuckets(fx.payload, `discussionPost:${user.id}`)
    }
  }
  await fx?.teardown()
})

describe('unread', () => {
  it('lights for another’s reply, never for your own, and clears when you read it', async () => {
    const topic = await createTopic(fx.users.teacher)
    await createReply(fx.users.teacher, topic.id)
    expect(await unreadTopicIds(fx.payload, fx.users.teacher.id, [topic.id])).toEqual([])

    await createReply(fx.users.editor, topic.id, 1)
    expect(await unreadTopicIds(fx.payload, fx.users.teacher.id, [topic.id])).toEqual([topic.id])
    expect(await hasUnread(fx.payload, fx.users.teacher.id)).toBe(true)

    expect(
      await statusOf(
        call(markReadEndpoint, fx.users.teacher, topic.id, { fromSeq: 1, throughSeq: 2 }),
      ),
    ).toBe(200)
    expect(await unreadTopicIds(fx.payload, fx.users.teacher.id, [topic.id])).toEqual([])
  })

  it('counts a "Deleted User" reply as someone else’s (IS DISTINCT FROM, not <>)', async () => {
    const leaver = await markedUser('unread-leaver')
    const topic = await createTopic(fx.users.teacher)
    await createReply(leaver, topic.id)
    await fx.payload.delete({ collection: 'users', id: leaver.id, overrideAccess: true })
    expect(await unreadTopicIds(fx.payload, fx.users.teacher.id, [topic.id])).toEqual([topic.id])
    await clearRateLimitBuckets(fx.payload, `discussionPost:${leaver.id}`)
  })

  it('shows an invited version author the opening post as unread, until they read it', async () => {
    const version = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.3.0',
        title: `${MARK}Plan v1.3.0`,
        author: fx.users.editor.id,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as LessonBundleVersion
    const topic = await createTopic(fx.users.teacher, { refVersion: version.id })
    expect(await unreadTopicIds(fx.payload, fx.users.editor.id, [topic.id])).toEqual([topic.id])
    await call(markReadEndpoint, fx.users.editor, topic.id, { fromSeq: 0, throughSeq: 0 })
    expect(await lastReadSeq(fx.users.editor.id, topic.id)).toBe(0)
    expect(await unreadTopicIds(fx.payload, fx.users.editor.id, [topic.id])).toEqual([])
  })

  it('is false and empty while the forum is off', async () => {
    const topic = await createTopic(fx.users.teacher)
    await createReply(fx.users.editor, topic.id)
    await withForumOff(fx.payload, async () => {
      expect(await hasUnread(fx.payload, fx.users.teacher.id)).toBe(false)
      expect(await unreadTopicIds(fx.payload, fx.users.teacher.id, [topic.id])).toEqual([])
    })
  })
})

describe('mark-read', () => {
  async function threadWithReplies(count: number) {
    const topic = await createTopic(fx.users.teacher)
    for (let seq = 0; seq < count; seq++) await createReply(fx.users.editor, topic.id, seq)
    return topic
  }

  it('never moves backwards across tabs', async () => {
    const topic = await threadWithReplies(4)
    await call(markReadEndpoint, fx.users.teacher, topic.id, { fromSeq: 1, throughSeq: 3 })
    await call(markReadEndpoint, fx.users.teacher, topic.id, { fromSeq: 0, throughSeq: 1 })
    expect(await lastReadSeq(fx.users.teacher.id, topic.id)).toBe(3)
  })

  it('never marks skipped replies: a range that does not follow on writes nothing', async () => {
    const topic = await threadWithReplies(6)
    await call(markReadEndpoint, fx.users.teacher, topic.id, { fromSeq: 5, throughSeq: 6 })
    expect(await lastReadSeq(fx.users.teacher.id, topic.id)).toBe(0)
  })

  it('writes nothing for someone who does not take part — reading never subscribes', async () => {
    const topic = await threadWithReplies(1)
    const res = await call(markReadEndpoint, fx.users.subjectAdmin, topic.id, {
      fromSeq: 0,
      throughSeq: 1,
    })
    expect(res.status).toBe(200)
    expect(await lastReadSeq(fx.users.subjectAdmin.id, topic.id)).toBeNull()
  })

  it('refuses a range past the thread (400), a missing thread (404), and a switched-off forum (403)', async () => {
    const topic = await threadWithReplies(1)
    const before = await lastReadSeq(fx.users.teacher.id, topic.id)
    expect(
      await statusOf(
        call(markReadEndpoint, fx.users.teacher, topic.id, { fromSeq: 0, throughSeq: 2 }),
      ),
    ).toBe(400)
    expect(await lastReadSeq(fx.users.teacher.id, topic.id), 'a refused range writes nothing').toBe(
      before,
    )
    expect(
      await statusOf(
        call(markReadEndpoint, fx.users.teacher, 999_999_999, { fromSeq: 0, throughSeq: 0 }),
      ),
    ).toBe(404)
    await withForumOff(fx.payload, async () => {
      expect(
        await statusOf(
          call(markReadEndpoint, fx.users.teacher, topic.id, { fromSeq: 0, throughSeq: 1 }),
        ),
      ).toBe(403)
    })
  })
})

describe('pin', () => {
  it('pins, re-pins to the top, and unpins — Site Administrator only, forum on only', async () => {
    const topic = await createTopic(fx.users.teacher)
    expect(await statusOf(call(pinEndpoint, fx.users.teacher, topic.id, { pinned: true }))).toBe(
      403,
    )

    await call(pinEndpoint, fx.users.siteAdmin, topic.id, { pinned: true })
    const first = (await topicById(topic.id)).pinnedAt
    expect(first).toBeTruthy()
    await call(pinEndpoint, fx.users.siteAdmin, topic.id, { pinned: true })
    expect(Date.parse((await topicById(topic.id)).pinnedAt!)).toBeGreaterThan(Date.parse(first!))
    await call(pinEndpoint, fx.users.siteAdmin, topic.id, { pinned: false })
    expect((await topicById(topic.id)).pinnedAt ?? null).toBeNull()

    await withForumOff(fx.payload, async () => {
      expect(
        await statusOf(call(pinEndpoint, fx.users.siteAdmin, topic.id, { pinned: true })),
      ).toBe(403)
    })
  })

  // ⚑ Payload's update reads the topic, then writes it back WHOLE (review 2026-10-10): a pin that read
  // before taking the topic's lock restored redacted text and rolled `lastSeq` back under a reply. Each
  // holder takes the lock BY PERFORMING the competing write and keeps it uncommitted while the pin starts;
  // the pin must wait for it and then keep it.
  it.each([
    [
      'a reply',
      // Exactly what reply creation commits: the seq increment AND the reply row that takes the new seq.
      (id: number) => sql`
        WITH "t" AS (
          UPDATE "discussion_topics" SET "last_seq" = "last_seq" + 1 WHERE "id" = ${id}
          RETURNING "last_seq"
        )
        INSERT INTO "discussion_replies" ("topic_id", "seq", "body", "author_id", "submission_key")
        SELECT ${id}, "last_seq", 'Competing reply', ${fx.users.editor.id}, ${newKey()} FROM "t"`,
      (topic: DiscussionTopic) => expect(topic.lastSeq).toBe(2),
    ],
    [
      'a redaction',
      (id: number) =>
        sql`UPDATE "discussion_topics" SET "body" = '', "redacted_at" = clock_timestamp() WHERE "id" = ${id}`,
      (topic: DiscussionTopic) => {
        expect(topic.body).toBe('')
        expect(topic.redactedAt).toBeTruthy()
      },
    ],
  ])('waits for %s and keeps it', async (_write, competingWrite, kept) => {
    const topic = await createTopic(fx.users.teacher)
    await createReply(fx.users.editor, topic.id)
    let pinning!: Promise<Response>
    await whileLockHeld(fx.payload, competingWrite(topic.id), async () => {
      pinning = call(pinEndpoint, fx.users.siteAdmin, topic.id, { pinned: true })
      expect(await stillPendingAfterWindow(pinning)).toBe(true)
    })
    expect((await pinning).status).toBe(200)
    const after = await topicById(topic.id)
    expect(after.pinnedAt).toBeTruthy()
    kept(after)
    // The next reply takes the next seq. A `lastSeq` rolled back under the competing reply would hand it a
    // seq that reply already holds, and the (topic, seq) unique index would refuse it.
    const next = await createReply(fx.users.editor, topic.id, Number(after.lastSeq))
    expect(next.seq).toBe(Number(after.lastSeq) + 1)
    const seqs = rowsOf<{ seq: string }>(
      await drizzleOf(fx.payload).execute(
        sql`SELECT "seq" FROM "discussion_replies" WHERE "topic_id" = ${topic.id} ORDER BY "seq"`,
      ),
    ).map((row) => Number(row.seq))
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1))
  })
})

describe('redaction', () => {
  it('erases a title and a post independently, stamps who and when, and refuses a second redaction (409)', async () => {
    const topic = await createTopic(fx.users.teacher, { title: `${MARK}Amina's marks` })
    expect(
      await statusOf(call(redactTopicEndpoint, fx.users.teacher, topic.id, { title: true })),
    ).toBe(403)

    expect(
      await statusOf(call(redactTopicEndpoint, fx.users.siteAdmin, topic.id, { title: true })),
    ).toBe(200)
    let after = await topicById(topic.id)
    expect(after.title).toBe('')
    expect(after.titleRedactedBy).toBe(fx.users.siteAdmin.id)
    expect(after.body).toBe('Opening post')

    expect(
      await statusOf(call(redactTopicEndpoint, fx.users.siteAdmin, topic.id, { title: true })),
    ).toBe(409)
    expect(
      await statusOf(call(redactTopicEndpoint, fx.users.siteAdmin, topic.id, { body: true })),
    ).toBe(200)
    after = await topicById(topic.id)
    expect(after.body).toBe('')
    expect(after.redactedBy).toBe(fx.users.siteAdmin.id)
    expect(
      await statusOf(call(redactTopicEndpoint, fx.users.siteAdmin, 999_999_999, { body: true })),
    ).toBe(404)
  })

  it('redacts a reply, works while the forum is off, and leaves the edit guard strict', async () => {
    const topic = await createTopic(fx.users.teacher)
    const reply = await createReply(fx.users.editor, topic.id)
    await withForumOff(fx.payload, async () => {
      expect(await statusOf(call(redactReplyEndpoint, fx.users.siteAdmin, reply.id))).toBe(200)
    })
    const after = await fx.payload.findByID({
      collection: 'discussion-replies',
      id: reply.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(after.body).toBe('')
    expect(after.seq).toBe(reply.seq)
    expect(await statusOf(call(redactReplyEndpoint, fx.users.siteAdmin, reply.id))).toBe(409)
    // Redaction is its own statement: the Payload update path stays closed to content changes.
    await expect(
      fx.payload.update({
        collection: 'discussion-topics',
        id: topic.id,
        data: { body: '' },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  /**
   * ⚑ LOCK ORDER — the administrator's user row before the post. The administrator redacts a topic they
   * authored while their own account is being deleted. The test holds the topic, so the redaction is parked
   * after taking the administrator's row; the deletion then queues behind it. Releasing lets both finish.
   * Taking the post first (the reverse order) parks the redaction holding nothing on the user, the deletion
   * locks the user and reaches this topic, and the redaction's `redacted_by_id` foreign key then wants the
   * user — 40P01.
   */
  it('redaction and the administrator’s account deletion both finish — no deadlock', async () => {
    const admin = await markedUser('redacting-admin', { roles: ['siteAdmin'] })
    const topic = await createTopic(admin)
    let redacting!: Promise<Response>
    let deleting!: Promise<unknown>
    let redactionParked = false
    let deletionWaits = false
    await whileRowLocked(fx.payload, 'discussion_topics', topic.id, async () => {
      redacting = call(redactTopicEndpoint, admin, topic.id, { body: true })
      redactionParked = await stillPendingAfterWindow(redacting)
      deleting = fx.payload.delete({ collection: 'users', id: admin.id, overrideAccess: true })
      deletionWaits = await stillPendingAfterWindow(deleting)
    })
    expect(redactionParked, 'precondition: the redaction is parked on the topic').toBe(true)
    expect(deletionWaits, 'precondition: the deletion is waiting too').toBe(true)
    const outcomes = await Promise.allSettled([redacting, deleting])
    expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled'])
    expect((await topicById(topic.id)).body).toBe('')
    await clearRateLimitBuckets(fx.payload, `discussionPost:${admin.id}`)
  }, 30_000)
})

describe('title search', () => {
  it('matches every word in any order, case-insensitively, in Swahili too, one row per topic', async () => {
    const a = await createTopic(fx.users.teacher, { title: `${MARK} Fractions lesson plenary` })
    const b = await createTopic(fx.users.teacher, { title: `${MARK} Lesson on FRACTIONS` })
    const c = await createTopic(fx.users.teacher, { title: `${MARK} Kazi ya sehemu: tathmini` })
    const found = async (query: string) =>
      (
        (await searchTopicTitles(fx.payload, { user: fx.users.teacher, query: `${MARK} ${query}` }))
          ?.docs ?? []
      )
        .map((d) => d.id)
        .sort()
    expect(await found('fractions lesson')).toEqual([a.id, b.id].sort())
    expect(await found('tathmini sehemu')).toEqual([c.id])
    expect(await found('fract')).toEqual([a.id, b.id].sort())
  })

  it('treats %, _ and \\ literally', async () => {
    const pct = await createTopic(fx.users.teacher, { title: `${MARK} Score 50% today` })
    await createTopic(fx.users.teacher, { title: `${MARK} Score 500 today` })
    const under = await createTopic(fx.users.teacher, { title: `${MARK} file_name rules` })
    await createTopic(fx.users.teacher, { title: `${MARK} filexname rules` })
    const slash = await createTopic(fx.users.teacher, { title: `${MARK} path a\\b` })
    const ids = async (query: string) =>
      (
        (await searchTopicTitles(fx.payload, { user: fx.users.teacher, query: `${MARK} ${query}` }))
          ?.docs ?? []
      ).map((d) => d.id)
    expect(await ids('50%')).toEqual([pct.id])
    expect(await ids('file_name')).toEqual([under.id])
    expect(await ids('a\\b')).toEqual([slash.id])
  })

  it('no longer finds a redacted title, and returns nothing while the forum is off', async () => {
    const topic = await createTopic(fx.users.teacher, { title: `${MARK} Private details here` })
    await call(redactTopicEndpoint, fx.users.siteAdmin, topic.id, { title: true })
    expect(
      (
        await searchTopicTitles(fx.payload, {
          user: fx.users.teacher,
          query: `${MARK} Private details`,
        })
      )?.docs,
    ).toEqual([])
    await withForumOff(fx.payload, async () => {
      expect(
        await searchTopicTitles(fx.payload, { user: fx.users.siteAdmin, query: `${MARK} Topic` }),
      ).toBeNull()
    })
  })
})
