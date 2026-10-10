/**
 * Discussions 4a — the pages' server reads (`src/lib/discussionPages.ts`), against a real database
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.5, 4a contract).
 *
 * ⚑ THE LOAD-BEARING CASES (GPT review 2026-10-10):
 *   - pins are their own block — an unpinned topic never sorts above them, and a pinned topic never
 *     appears in the activity pages; search orders by activity with no pin priority;
 *   - a thread opens at the page holding `lastReadSeq + 1`, exactly at the 50/51 boundary, and at page 1
 *     for a non-participant and an invited author (−1);
 *   - a deleted referenced version leaves its label with NO link at all.
 *
 * Requires a DB (like all of `tests/int`). The forum is switched on explicitly (see discussions.int.spec.ts).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import {
  MARK,
  minimalBundleContent,
  setForumEnabled,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import { drizzleOf } from '../helpers/db.js'
import { clearPostingCaps, createTopicAs } from '../helpers/discussions.js'
import { listTopics, loadThread, searchTopics } from '../../src/lib/discussionPages.js'
import type { DiscussionTopic, LessonBundleVersion, User } from '../../src/payload-types.js'

let fx: RoleFixture
const db = () => drizzleOf(fx.payload)
const createTopic = (user: User, data: Record<string, unknown> = {}) =>
  createTopicAs(fx.payload, user, data)

/** Set a topic's activity to `minutesAhead` minutes from now — ahead of anything else in the database, so
 *  this spec's topics are the newest and own the first pages whatever other specs left behind. */
const setActivity = (id: number, minutesAhead: number) =>
  db().execute(
    sql`UPDATE discussion_topics SET last_activity_at = now() + make_interval(mins => ${minutesAhead}) WHERE id = ${id}`,
  )

const pin = (id: number, minutesAgo: number) =>
  db().execute(
    sql`UPDATE discussion_topics SET pinned_at = now() - make_interval(mins => ${minutesAgo}) WHERE id = ${id}`,
  )

/** `count` replies by `author`, written directly (the posting path is 3a's subject; the cap is not). */
async function bulkReplies(topicId: number, author: User, count: number) {
  await db().execute(sql`
    INSERT INTO discussion_replies (topic_id, seq, body, author_id, submission_key)
    SELECT ${topicId}, g, 'Reply ' || g, ${author.id}, ${`bulk-${topicId}-`} || g
      FROM generate_series(1, ${count}) g`)
  await db().execute(sql`UPDATE discussion_topics SET last_seq = ${count} WHERE id = ${topicId}`)
}

async function setMarker(userId: number, topicId: number, lastReadSeq: number) {
  await db().execute(sql`
    INSERT INTO discussion_participation (user_id, topic_id, last_read_seq)
    VALUES (${userId}, ${topicId}, ${lastReadSeq})
    ON CONFLICT (user_id, topic_id) DO UPDATE SET last_read_seq = excluded.last_read_seq`)
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  await setForumEnabled(fx.payload, true)
}, 60_000)

afterAll(async () => {
  if (fx) await clearPostingCaps(fx.payload, Object.values(fx.users))
  await fx?.teardown()
})

describe('the topic list', () => {
  it('keeps pins in their own block, most recently pinned first, out of the activity pages', async () => {
    const topics: DiscussionTopic[] = []
    for (let i = 0; i < 24; i++) topics.push(await createTopic(fx.users.teacher))
    // topics[0] is the most active, topics[23] the least.
    for (const [i, t] of topics.entries()) await setActivity(t.id, 1000 - i)
    const [olderPin, newerPin] = [topics[1], topics[22]]
    await pin(olderPin.id, 60)
    await pin(newerPin.id, 5)
    const ours = new Set(topics.map((t) => t.id))
    const pinnedIds = new Set([olderPin.id, newerPin.id])

    const page1 = await listTopics(fx.payload, fx.users.teacher, 1)
    expect(page1.pinned.map((r) => r.id).filter((id) => ours.has(id))).toEqual([
      newerPin.id,
      olderPin.id,
    ])
    // ⚑ An unpinned topic never sorts above the pins: they are a separate block, and page 1's rows are
    // this spec's 20 most active UNPINNED topics, in activity order.
    const unpinned = topics.filter((t) => !pinnedIds.has(t.id))
    expect(page1.rows.map((r) => r.id)).toEqual(unpinned.slice(0, 20).map((t) => t.id))

    const page2 = await listTopics(fx.payload, fx.users.teacher, 2)
    expect(page2.pinned).toEqual([])
    expect(page2.rows.slice(0, 2).map((r) => r.id)).toEqual(unpinned.slice(20).map((t) => t.id))
    for (const page of [page1, page2]) {
      expect(page.rows.some((r) => pinnedIds.has(r.id))).toBe(false)
    }
  })

  it('shows the reply count, the author name and the unread marker', async () => {
    const topic = await createTopic(fx.users.teacher)
    await setActivity(topic.id, 2000)
    await bulkReplies(topic.id, fx.users.editor, 3)
    const [row] = (await listTopics(fx.payload, fx.users.teacher, 1)).rows
    expect(row).toMatchObject({ id: topic.id, replyCount: 3, unread: true })
    expect(row.authorName).toBe(fx.users.teacher.name)
  })
})

describe('title search', () => {
  it('orders by activity with no pin priority', async () => {
    const token = `zq${crypto.randomUUID().slice(0, 8)}`
    const a = await createTopic(fx.users.teacher, { title: `${MARK}${token} alpha` })
    const b = await createTopic(fx.users.teacher, { title: `${MARK}${token} beta` })
    const c = await createTopic(fx.users.teacher, { title: `${MARK}${token} gamma` })
    await setActivity(a.id, 30)
    await setActivity(b.id, 20)
    await setActivity(c.id, 10)
    await pin(c.id, 1)
    const results = await searchTopics(fx.payload, fx.users.teacher, token, 1)
    expect(results?.rows.map((r) => r.id)).toEqual([a.id, b.id, c.id])
  })
})

describe('the thread', () => {
  it('opens at the page holding lastReadSeq + 1, exactly at the boundary', async () => {
    const topic = await createTopic(fx.users.teacher)
    await bulkReplies(topic.id, fx.users.editor, 51)
    const open = async (user: User, page?: string) =>
      (await loadThread(fx.payload, user, topic.id, page)).page

    await setMarker(fx.users.teacher.id, topic.id, 49)
    expect(await open(fx.users.teacher)).toBe(1)
    await setMarker(fx.users.teacher.id, topic.id, 50)
    expect(await open(fx.users.teacher)).toBe(2)
    await setMarker(fx.users.teacher.id, topic.id, 51)
    expect(await open(fx.users.teacher), 'all read → the newest page').toBe(2)

    // A non-participant, and an invited author at −1, start at page 1.
    expect(await open(fx.users.editor)).toBe(1)
    await setMarker(fx.users.subjectAdmin.id, topic.id, -1)
    expect(await open(fx.users.subjectAdmin)).toBe(1)

    // An explicit page is honoured; an impossible one falls back to the entry page.
    expect(await open(fx.users.teacher, '1')).toBe(1)
    expect(await open(fx.users.teacher, '3')).toBe(2)
  })

  it('shows exactly the page’s replies, with the opening post on every page', async () => {
    const topic = await createTopic(fx.users.teacher, { body: 'The question' })
    await bulkReplies(topic.id, fx.users.editor, 51)
    const page1 = await loadThread(fx.payload, fx.users.teacher, topic.id, '1')
    expect(page1.replies.map((r) => r.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    const page2 = await loadThread(fx.payload, fx.users.teacher, topic.id, '2')
    expect(page2.replies.map((r) => r.seq)).toEqual([51])
    expect(page2.opening.body).toBe('The question')
    expect(page2.totalPages).toBe(2)
    expect(page2.lastReadSeq).toBe(0) // the author joined at 0
  })

  it('renders a redacted title and post as removed', async () => {
    const topic = await createTopic(fx.users.teacher)
    await db().execute(
      sql`UPDATE discussion_topics SET title = '', title_redacted_at = now(), body = '', redacted_at = now() WHERE id = ${topic.id}`,
    )
    const thread = await loadThread(fx.payload, fx.users.teacher, topic.id, undefined)
    expect(thread.title).toBeNull()
    expect(thread.opening.body).toBeNull()
  })
})

describe('references', () => {
  it('links the version and Compare changes, and nothing at all once the version is gone', async () => {
    const saved = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.1',
        title: `${MARK}Plan v1.0.1`,
        sourceVersion: fx.version.id,
        author: fx.users.editor.id,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as LessonBundleVersion

    const aboutSaved = await createTopic(fx.users.teacher, { refVersion: saved.id })
    const aboutOfficial = await createTopic(fx.users.teacher, { refVersion: fx.version.id })

    const savedThread = await loadThread(fx.payload, fx.users.teacher, aboutSaved.id, undefined)
    expect(savedThread.opening.reference).toEqual({
      label: aboutSaved.refLabel,
      lessonHref: `/lessons/${fx.plan.id}?version=${saved.id}`,
      compareHref: `/lessons/${fx.plan.id}/compare?from=${fx.version.id}&to=${saved.id}`,
    })
    const officialThread = await loadThread(
      fx.payload,
      fx.users.teacher,
      aboutOfficial.id,
      undefined,
    )
    expect(officialThread.opening.reference?.compareHref, 'no recorded source').toBeNull()

    await fx.payload.delete({
      collection: 'lesson-bundle-versions',
      id: saved.id,
      overrideAccess: true,
    })
    const after = await loadThread(fx.payload, fx.users.teacher, aboutSaved.id, undefined)
    expect(after.opening.reference).toEqual({
      label: aboutSaved.refLabel,
      lessonHref: null,
      compareHref: null,
    })
  })
})
