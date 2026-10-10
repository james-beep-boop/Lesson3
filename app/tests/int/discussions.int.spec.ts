/**
 * Discussions 3a — posting, ordering, participation, immutability and deletion against a real database
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.4 and the 3a contract in §16.5).
 *
 * Creates go through the Local API AS a user (`overrideAccess: false, user`), which runs exactly the
 * access functions and hooks a REST request runs. The wire-level authorization matrix is
 * `tests/http/discussions.http.spec.ts`.
 *
 * ⚑ THE FORUM IS SWITCHED ON EXPLICITLY. This database is built by Payload's dev `push`, not by the
 * migrations, so the settings row the `add_forum_enabled` migration inserts does not exist here — and an
 * absent row reads as OFF (fail closed). Every case below would otherwise be refused at the gate.
 *
 * ⚑ CONCURRENCY IS ASSERTED AS WAITING, never as the outcome of a race (DECISIONS 2026-10-09, item 1):
 * hold the lock from an independent transaction and prove the operation blocks on it.
 *
 * Requires a DB (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

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
import type { DiscussionTopic, LessonBundleVersion, User } from '../../src/payload-types.js'

let fx: RoleFixture
let keyCounter = 0
/** A fresh, valid submissionKey — what a composer generates when it opens. */
const newKey = () => `${crypto.randomUUID()}-${++keyCounter}`

const setForum = (on: boolean) => setForumEnabled(fx.payload, on)

/** A marked user of the run's own — created when a case needs one it can delete. */
const markedUser = (label: string) =>
  createUserVerified(fx.payload, {
    email: `${MARK}${label}@example.test`.toLowerCase(),
    name: `${MARK}${label}`,
    password: fx.password,
  })

/**
 * An in-flight reply, as one statement for `whileLockHeld`: insert reply 1 and move `lastSeq` to 1 —
 * uncommitted while the holder runs. It is what a concurrent `orderReply` does, which is the point: a lock
 * test's holder must perform the competing write, not merely hold the lock (DECISIONS 2026-10-09).
 */
const inFlightReply = (topicId: number) =>
  sql`WITH bumped AS (
        UPDATE discussion_topics SET last_seq = 1 WHERE id = ${topicId} RETURNING id
      )
      INSERT INTO discussion_replies (topic_id, seq, body, updated_at, created_at)
      SELECT id, 1, 'In-flight reply', now(), now() FROM bumped`

async function createTopic(
  user: User,
  data: Record<string, unknown> = {},
): Promise<DiscussionTopic> {
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

async function createReply(user: User, topicId: number, data: Record<string, unknown> = {}) {
  return fx.payload.create({
    collection: 'discussion-replies',
    data: {
      topic: topicId,
      body: 'A reply',
      submissionKey: newKey(),
      joinedAtSeq: 0,
      ...data,
    } as never,
    overrideAccess: false,
    user,
  })
}

const topicById = (id: number) =>
  fx.payload.findByID({
    collection: 'discussion-topics',
    id,
    depth: 0,
    overrideAccess: true,
  }) as Promise<DiscussionTopic>

/** Participation as `{ userId: lastReadSeq }`, read raw so no access rule colours it. */
async function participation(topicId: number): Promise<Record<number, number>> {
  const rows = rowsOf<{ user_id: number; last_read_seq: string }>(
    await drizzleOf(fx.payload).execute(
      sql`SELECT user_id, last_read_seq FROM discussion_participation WHERE topic_id = ${topicId}`,
    ),
  )
  return Object.fromEntries(rows.map((r) => [Number(r.user_id), Number(r.last_read_seq)]))
}

/** A version of the fixture plan authored by `author` — the referenced version that invites them. */
const versionBy = async (author: User | null, semver: string) =>
  (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      title: `${MARK}Plan v${semver}`,
      author: author?.id ?? null,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as LessonBundleVersion

beforeAll(async () => {
  fx = await setupRoleFixture()
  await setForum(true)
}, 60_000)

afterAll(async () => {
  if (fx) {
    for (const user of Object.values(fx.users)) {
      await clearRateLimitBuckets(fx.payload, `discussionPost:${user.id}`)
    }
  }
  await fx?.teardown()
})

describe('posting a topic', () => {
  it('stamps the author and the reference, and ignores forged system fields', async () => {
    const version = await versionBy(fx.users.editor, '1.0.1')
    const topic = await createTopic(fx.users.teacher, {
      refVersion: version.id,
      // Forged system fields — every one must be dropped and overwritten by the server.
      author: fx.users.siteAdmin.id,
      refPlan: 999_999,
      refLabel: 'forged',
      lastSeq: 42,
      pinnedAt: new Date().toISOString(),
    })
    expect(topic.author).toBe(fx.users.teacher.id)
    expect(topic.refVersion).toBe(version.id)
    expect(topic.refPlan).toBe(fx.plan.id)
    expect(topic.refLabel).toMatch(/ · v1\.0\.1$/)
    expect(topic.lastSeq).toBe(0)
    expect(topic.pinnedAt ?? null).toBeNull()
  })

  it('adds the author at 0 and the referenced version’s author at −1 (opening post unread)', async () => {
    const version = await versionBy(fx.users.editor, '1.0.2')
    const topic = await createTopic(fx.users.teacher, { refVersion: version.id })
    expect(await participation(topic.id)).toEqual({
      [fx.users.teacher.id]: 0,
      [fx.users.editor.id]: -1,
    })
  })

  it('invites nobody when the version author IS the topic author, or the version has no author', async () => {
    const own = await versionBy(fx.users.teacher, '1.0.3')
    const t1 = await createTopic(fx.users.teacher, { refVersion: own.id })
    expect(await participation(t1.id)).toEqual({ [fx.users.teacher.id]: 0 })

    const anonymous = await versionBy(null, '1.0.4')
    const t2 = await createTopic(fx.users.teacher, { refVersion: anonymous.id })
    expect(await participation(t2.id)).toEqual({ [fx.users.teacher.id]: 0 })
  })

  it('refuses a duplicate submissionKey with 409, before any second post exists', async () => {
    const submissionKey = newKey()
    await createTopic(fx.users.teacher, { submissionKey })
    await expect(createTopic(fx.users.teacher, { submissionKey })).rejects.toMatchObject({
      status: 409,
    })
    const { totalDocs } = await fx.payload.count({
      collection: 'discussion-topics',
      where: { submissionKey: { equals: submissionKey } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(1)
  })

  it('refuses a missing submissionKey and an unreadable reference with 400', async () => {
    await expect(createTopic(fx.users.teacher, { submissionKey: undefined })).rejects.toMatchObject(
      {
        status: 400,
      },
    )
    await expect(createTopic(fx.users.teacher, { refVersion: 999_999_999 })).rejects.toMatchObject({
      status: 400,
    })
  })
})

describe('replying', () => {
  it('numbers replies in order and advances the thread’s activity', async () => {
    const topic = await createTopic(fx.users.teacher)
    const r1 = await createReply(fx.users.editor, topic.id, { joinedAtSeq: 0 })
    const r2 = await createReply(fx.users.subjectAdmin, topic.id, { joinedAtSeq: 1 })
    expect([r1.seq, r2.seq]).toEqual([1, 2])

    const after = await topicById(topic.id)
    expect(after.lastSeq).toBe(2)
    expect(Date.parse(after.lastActivityAt!)).toBeGreaterThanOrEqual(
      Date.parse(topic.lastActivityAt!),
    )
  })

  it('starts a first-time replier at the joinedAtSeq they replied from (the virtual field reaches the hooks)', async () => {
    const topic = await createTopic(fx.users.teacher)
    await createReply(fx.users.editor, topic.id, { joinedAtSeq: 0 })
    await createReply(fx.users.editor, topic.id, { joinedAtSeq: 1 })
    // subjectAdmin opened the page when lastSeq was 1, and reply 2 arrived while they typed.
    await createReply(fx.users.subjectAdmin, topic.id, { joinedAtSeq: 1 })
    expect((await participation(topic.id))[fx.users.subjectAdmin.id]).toBe(1)
  })

  it('never moves an existing participant’s read marker by posting again', async () => {
    const topic = await createTopic(fx.users.teacher)
    await createReply(fx.users.editor, topic.id, { joinedAtSeq: 0 })
    await createReply(fx.users.editor, topic.id, { joinedAtSeq: 1 })
    expect((await participation(topic.id))[fx.users.editor.id]).toBe(0)
    expect((await participation(topic.id))[fx.users.teacher.id]).toBe(0)
  })

  it('refuses a joinedAtSeq ahead of the thread, and writes nothing', async () => {
    const topic = await createTopic(fx.users.teacher)
    await expect(createReply(fx.users.editor, topic.id, { joinedAtSeq: 5 })).rejects.toMatchObject({
      status: 400,
    })
    await expect(createReply(fx.users.editor, topic.id, { joinedAtSeq: -1 })).rejects.toMatchObject(
      {
        status: 400,
      },
    )
    expect((await topicById(topic.id)).lastSeq).toBe(0)
    expect(await participation(topic.id)).toEqual({ [fx.users.teacher.id]: 0 })
  })

  it('a failed reply leaves the thread’s activity and participants unchanged', async () => {
    const topic = await createTopic(fx.users.teacher)
    await expect(createReply(fx.users.editor, topic.id, { body: '   ' })).rejects.toBeTruthy()
    const after = await topicById(topic.id)
    expect(after.lastSeq).toBe(0)
    expect(after.lastActivityAt).toBe(topic.lastActivityAt)
    expect(await participation(topic.id)).toEqual({ [fx.users.teacher.id]: 0 })
  })

  /**
   * ⚑ THE HOLDER IS A CONCURRENT REPLY, not just a lock. A bare row lock proved nothing: without
   * `orderReply`'s lock the reply still blocked — on its later write to the topic row — and, since nothing
   * had changed underneath it, was numbered correctly anyway (caught by mutation testing). So the holder
   * does what a concurrent reply does: it inserts reply 1 and moves `lastSeq` to 1, uncommitted. With the
   * lock, our reply waits, reads `lastSeq = 1`, and becomes reply 2. Without it, it reads the stale 0,
   * claims seq 1, and dies on the `(topic, seq)` uniqueness rule once the holder commits.
   */
  it('waits on the topic lock and numbers after a reply committed meanwhile', async () => {
    const topic = await createTopic(fx.users.teacher)
    let replying!: Promise<{ seq?: number | null }>
    let blocked = false
    await whileLockHeld(fx.payload, inFlightReply(topic.id), async () => {
      replying = createReply(fx.users.editor, topic.id)
      blocked = await stillPendingAfterWindow(replying)
    })
    expect(blocked, 'the reply must block on the topic row').toBe(true)
    expect((await replying).seq).toBe(2)
    expect((await topicById(topic.id)).lastSeq).toBe(2)
  }, 30_000)
})

describe('replying while others write (review 2026-10-09)', () => {
  /**
   * ⚑ THE DEADLOCK REGRESSION, through the real application paths. The thread's author replies to their
   * own thread while their account is being deleted.
   *
   * The test holds the topic row, so the reply is parked mid-flight. Then the account deletion starts.
   *   - FIXED ORDER (author's user row, then topic): the parked reply already holds `FOR KEY SHARE` on the
   *     user, so the deletion's `lockDeletingUser` queues behind it. Releasing the topic lets the reply
   *     commit, then the deletion — both succeed.
   *   - OLD ORDER (topic, then user): the reply holds nothing on the user while parked, so the deletion
   *     locks the user and reaches `ON DELETE SET NULL` on this topic. When the topic is released the reply
   *     takes it and then wants the user — a cycle, which Postgres breaks by aborting one with 40P01.
   */
  it('a thread author’s reply and account deletion both finish — no deadlock', async () => {
    const author = await markedUser('author-departing')
    const topic = await createTopic(author)
    let replying!: Promise<unknown>
    let deleting!: Promise<unknown>
    let replyParked = false
    let deletionWaits = false
    await whileRowLocked(fx.payload, 'discussion_topics', topic.id, async () => {
      replying = createReply(author, topic.id)
      replyParked = await stillPendingAfterWindow(replying)
      deleting = fx.payload.delete({ collection: 'users', id: author.id, overrideAccess: true })
      deletionWaits = await stillPendingAfterWindow(deleting)
    })
    expect(replyParked, 'precondition: the reply is parked on the topic').toBe(true)
    expect(deletionWaits, 'precondition: the deletion is waiting too').toBe(true)
    // Neither may fail — a 40P01 here is the cycle.
    await expect(replying).resolves.toBeTruthy()
    await expect(deleting).resolves.toBeTruthy()
    // The thread and its reply survive the account, with the author cleared.
    const after = await topicById(topic.id)
    expect(after.author ?? null).toBeNull()
    expect(after.lastSeq).toBe(1)
    await clearRateLimitBuckets(fx.payload, `discussionPost:${author.id}`)
  }, 30_000)

  /**
   * ⚑ ACTIVITY NEVER MOVES BACKWARDS. The holder is an in-flight reply that stamps a LATER activity time
   * than our reply's transaction began. `now()` (transaction start) would write our older time over it;
   * the fixed statement keeps the greater of the two.
   */
  it('a reply that finishes after a later one never moves activity backwards', async () => {
    const topic = await createTopic(fx.users.teacher)
    const later = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    let replying!: Promise<unknown>
    await whileLockHeld(
      fx.payload,
      sql`WITH bumped AS (
            UPDATE discussion_topics SET last_seq = 1, last_activity_at = ${later}
             WHERE id = ${topic.id} RETURNING id
          )
          INSERT INTO discussion_replies (topic_id, seq, body, updated_at, created_at)
          SELECT id, 1, 'Later reply', now(), now() FROM bumped`,
      async () => {
        replying = createReply(fx.users.editor, topic.id)
        expect(await stillPendingAfterWindow(replying)).toBe(true)
      },
    )
    await replying
    const after = await topicById(topic.id)
    expect(after.lastSeq).toBe(2)
    expect(Date.parse(after.lastActivityAt!)).toBeGreaterThanOrEqual(Date.parse(later))
  }, 30_000)
})

describe('immutability', () => {
  it('refuses a content change even on the trusted path, but lets system fields move', async () => {
    const topic = await createTopic(fx.users.teacher)
    await expect(
      fx.payload.update({
        collection: 'discussion-topics',
        id: topic.id,
        data: { title: `${MARK}Edited` },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 403 })
    const moved = await fx.payload.update({
      collection: 'discussion-topics',
      id: topic.id,
      data: { lastActivityAt: new Date().toISOString() },
      overrideAccess: true,
    })
    expect(moved.title).toBe(topic.title)
  })

  it('refuses a reply edit on the trusted path', async () => {
    const topic = await createTopic(fx.users.teacher)
    const reply = await createReply(fx.users.editor, topic.id)
    await expect(
      fx.payload.update({
        collection: 'discussion-replies',
        id: reply.id,
        data: { body: 'Changed' },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('deletion', () => {
  it('account deletion and whole-thread deletion both finish when participation is locked', async () => {
    const author = await markedUser('thread-delete-departing')
    const topic = await createTopic(author)
    let accountDeletion!: Promise<unknown>
    let threadDeletion!: Promise<unknown>
    await whileLockHeld(
      fx.payload,
      sql`UPDATE discussion_participation SET last_read_seq = 0
          WHERE user_id = ${author.id} AND topic_id = ${topic.id}`,
      async () => {
        accountDeletion = fx.payload.delete({
          collection: 'users',
          id: author.id,
          overrideAccess: true,
        })
        expect(await stillPendingAfterWindow(accountDeletion)).toBe(true)
        threadDeletion = fx.payload.delete({
          collection: 'discussion-topics',
          id: topic.id,
          overrideAccess: true,
        })
        expect(await stillPendingAfterWindow(threadDeletion)).toBe(true)
      },
    )
    // The old account cascade held participation before its FK cleanup needed the topic;
    // thread deletion held the topic before deleting participation. Neither may abort with 40P01.
    const outcomes = await Promise.allSettled([accountDeletion, threadDeletion])
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(await participation(topic.id)).toEqual({})
    await clearRateLimitBuckets(fx.payload, `discussionPost:${author.id}`)
  }, 30_000)

  it('a whole-thread delete removes its replies and participants, and nothing else', async () => {
    const doomed = await createTopic(fx.users.teacher)
    await createReply(fx.users.editor, doomed.id)
    const kept = await createTopic(fx.users.teacher)
    await createReply(fx.users.editor, kept.id)

    await fx.payload.delete({
      collection: 'discussion-topics',
      id: doomed.id,
      overrideAccess: true,
    })

    const replies = await fx.payload.count({
      collection: 'discussion-replies',
      where: { topic: { in: [doomed.id, kept.id] } },
      overrideAccess: true,
    })
    expect(replies.totalDocs).toBe(1)
    expect(await participation(doomed.id)).toEqual({})
    expect(Object.keys(await participation(kept.id))).toHaveLength(2)
  })

  /**
   * ⚑ THE HOLDER IS AN IN-FLIGHT REPLY: it inserts reply 1 and bumps `lastSeq`, uncommitted. With
   * `cascadeDeleteThread`'s topic lock, the delete waits, then removes that reply with the rest. Without
   * it, the cascade misses the uncommitted reply, the topic's own DELETE then waits, and when the reply
   * commits the delete fails on its NOT NULL `topic_id` (mutation-tested).
   */
  it('a whole-thread delete waits for an in-flight reply and removes it too', async () => {
    const topic = await createTopic(fx.users.teacher)
    let deleting!: Promise<unknown>
    let blocked = false
    await whileLockHeld(fx.payload, inFlightReply(topic.id), async () => {
      deleting = fx.payload.delete({
        collection: 'discussion-topics',
        id: topic.id,
        overrideAccess: true,
      })
      blocked = await stillPendingAfterWindow(deleting)
    })
    expect(blocked, 'the delete must wait on the topic row').toBe(true)
    await deleting
    const left = await fx.payload.count({
      collection: 'discussion-replies',
      where: { topic: { equals: topic.id } },
      overrideAccess: true,
    })
    expect(left.totalDocs).toBe(0)
  }, 30_000)

  it('deleting a referenced version clears the reference and keeps the post and its label', async () => {
    const version = await versionBy(fx.users.editor, '1.1.0')
    const topic = await createTopic(fx.users.teacher, { refVersion: version.id })
    await fx.payload.delete({
      collection: 'lesson-bundle-versions',
      id: version.id,
      overrideAccess: true,
    })
    const after = await topicById(topic.id)
    expect(after.refVersion ?? null).toBeNull()
    expect(after.refLabel).toBe(topic.refLabel)
    expect(after.body).toBe(topic.body)
  })

  it('deleting an account keeps its posts (author cleared) and removes its participation', async () => {
    const leaver = await markedUser('leaver')
    const topic = await createTopic(leaver)
    const reply = await createReply(leaver, topic.id)

    await fx.payload.delete({ collection: 'users', id: leaver.id, overrideAccess: true })

    expect((await topicById(topic.id)).author ?? null).toBeNull()
    const keptReply = await fx.payload.findByID({
      collection: 'discussion-replies',
      id: reply.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(keptReply.author ?? null).toBeNull()
    expect(keptReply.body).toBe('A reply')
    expect(await participation(topic.id)).toEqual({})
    await clearRateLimitBuckets(fx.payload, `discussionPost:${leaver.id}`)
  })

  /**
   * ⚑ THE HOLDER IS AN IN-FLIGHT PARTICIPATION INSERT for the account being deleted (the same statement
   * `insertParticipation` runs, so it holds `FOR KEY SHARE` on the user row), uncommitted. With
   * `cascadeDeleteUserParticipation`'s row lock, the deletion waits, then removes that row and succeeds.
   * Without it, the cascade misses the uncommitted row, the user DELETE waits, and when the insert commits
   * the delete fails on the NOT NULL `user_id` (mutation-tested).
   */
  it('an account deletion waits for an in-flight participation insert and removes it too', async () => {
    const joiner = await markedUser('joiner')
    const topic = await createTopic(fx.users.teacher)
    let deleting!: Promise<unknown>
    let blocked = false
    await whileLockHeld(
      fx.payload,
      sql`INSERT INTO discussion_participation (user_id, topic_id, last_read_seq, updated_at, created_at)
          SELECT u.id, ${topic.id}, 0, now(), now() FROM users u WHERE u.id = ${joiner.id} FOR KEY SHARE`,
      async () => {
        deleting = fx.payload.delete({ collection: 'users', id: joiner.id, overrideAccess: true })
        blocked = await stillPendingAfterWindow(deleting)
      },
    )
    expect(blocked, 'the account deletion must wait on the user row').toBe(true)
    await deleting
    expect(await participation(topic.id)).toEqual({ [fx.users.teacher.id]: 0 })
  }, 30_000)

  /**
   * ⚑ THE CONTRACT ITEM 2 CASE. The referenced version's author is deleted while someone else posts a
   * topic that would invite them. The delete is held open in an independent transaction; the topic's
   * participation insert must WAIT on that user row (`FOR KEY SHARE`), then — finding the user gone —
   * insert nothing, and the topic must still be created. Without `FOR KEY SHARE`, the insert reads the
   * not-yet-deleted user, its foreign-key check then fails when the delete commits, and the innocent
   * poster's topic is lost.
   */
  it('a topic still posts when the invited version author is deleted at the same moment', async () => {
    const departing = await markedUser('departing')
    const version = await versionBy(departing, '1.2.0')

    let posting!: Promise<DiscussionTopic>
    let blocked = false
    // A bare row delete, held uncommitted: this fresh user owns nothing with a NOT NULL reference, and
    // the version's `author` is ON DELETE SET NULL.
    await whileLockHeld(fx.payload, sql`DELETE FROM users WHERE id = ${departing.id}`, async () => {
      posting = createTopic(fx.users.teacher, { refVersion: version.id })
      blocked = await stillPendingAfterWindow(posting)
    })

    expect(blocked, 'the participation insert must wait on the user row').toBe(true)
    const topic = await posting
    expect(await participation(topic.id)).toEqual({ [fx.users.teacher.id]: 0 })
  }, 30_000)
})

describe('the off switch (3a gates)', () => {
  it('while off: nobody posts, only the Site Administrator reads, nobody reads participation', async () => {
    const topic = await createTopic(fx.users.teacher)
    await withForumOff(fx.payload, async () => {
      await expect(createTopic(fx.users.teacher)).rejects.toMatchObject({ status: 403 })
      await expect(createTopic(fx.users.siteAdmin)).rejects.toMatchObject({ status: 403 })
      await expect(createReply(fx.users.teacher, topic.id)).rejects.toMatchObject({ status: 403 })

      await expect(
        fx.payload.findByID({
          collection: 'discussion-topics',
          id: topic.id,
          overrideAccess: false,
          user: fx.users.teacher,
        }),
      ).rejects.toMatchObject({ status: 403 })
      const asAdmin = await fx.payload.findByID({
        collection: 'discussion-topics',
        id: topic.id,
        overrideAccess: false,
        user: fx.users.siteAdmin,
      })
      expect(asAdmin.id).toBe(topic.id)

      for (const user of [fx.users.teacher, fx.users.siteAdmin]) {
        await expect(
          fx.payload.find({
            collection: 'discussion-participation',
            overrideAccess: false,
            user,
          }),
        ).rejects.toMatchObject({ status: 403 })
      }
    })
  })
})
