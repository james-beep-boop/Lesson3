/**
 * Wire-level authorization for the discussion forum, 3a (`docs/DESIGN-discussions-2026-10-09.md`
 * §16.4 and the 3a contract in §16.5) — the standing CLAUDE.md rule for new endpoints and access rules.
 *
 * Covers the three collections' REST doors and the whole-thread delete endpoint for an anonymous caller,
 * each role, and the Site Administrator; the off switch (3a gate table); and privacy under expanded
 * reads (`?depth=2` must still return ids only — contract item 4).
 *
 * HOW IT RUNS: like the rest of `tests/http` — a running app plus a seedable DB, MARK-tagged and
 * self-cleaning (`purgeMarked` removes marked topics with their replies and participation):
 *
 *   scripts/in-deps.sh --network lesson3_default --env-file .env \
 *     -e NODE_ENV=production -e E2E_BASE_URL=http://app:3000 -- npm run test:http
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { clearLoginTargetBudget } from '../helpers/db.js'
import {
  createUserVerified,
  deleteUserFixture,
  MARK,
  minimalBundleContent,
  setForumEnabled,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'
import { clearPostingCaps } from '../helpers/discussions.js'
import { login, url } from '../helpers/httpWire.js'
import {
  lessonSearchPath,
  lessonVersionsPath,
} from '../../src/components/Discussions/referencePickerQueries.js'
import { stillPendingAfterWindow, whileRowLocked } from '../helpers/rowLocks.js'

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']
/** ⚑ `editor` is a fixture key, not a user type — the user it names is a Teacher with editing access. */
const LABEL: Record<RoleKey, string> = {
  siteAdmin: 'Site Administrator',
  subjectAdmin: 'Subject Administrator',
  editor: 'Teacher with editing access',
  teacher: 'Teacher',
}

let fx: RoleFixture
const token: Partial<Record<RoleKey, string>> = {}

interface Res {
  status: number
  body: Record<string, unknown> | null
  text: string
}

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  as?: RoleKey,
  body?: unknown,
): Promise<Res> {
  const res = await fetch(url(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(as ? { Authorization: `JWT ${token[as]}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    // not JSON — `text` still carries it
  }
  return { status: res.status, body: parsed, text }
}

const newKey = () => crypto.randomUUID()
const topicBody = (extra: Record<string, unknown> = {}) => ({
  title: `${MARK}Wire topic`,
  body: 'Opening post',
  submissionKey: newKey(),
  ...extra,
})

/** Post a topic as `as` and return its id (asserting the 201). */
async function postTopic(as: RoleKey, extra: Record<string, unknown> = {}): Promise<number> {
  const res = await call('POST', '/api/discussion-topics', as, topicBody(extra))
  expect(res.status, res.text).toBe(201)
  return (res.body?.doc as { id: number }).id
}

const setForum = (on: boolean) => setForumEnabled(fx.payload, on)

/** A reply body for `topicId`, joined at the opening post unless `extra` says otherwise. */
const replyBody = (topicId: number, extra: Record<string, unknown> = {}) => ({
  topic: topicId,
  body: 'Wire reply',
  submissionKey: newKey(),
  joinedAtSeq: 0,
  ...extra,
})

/** The whole-thread delete endpoint, as `as`. */
const deleteThread = (topicId: number, as?: RoleKey) =>
  call('POST', `/api/discussion-topics/${topicId}/delete`, as)

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens: string[] = []
  for (const k of ROLES) tokens.push(await login(fx.users[k].email, fx.password))
  ROLES.forEach((k, i) => (token[k] = tokens[i]))
  await setForum(true)
})

afterAll(async () => {
  if (fx) {
    await setForum(true)
    await clearPostingCaps(
      fx.payload,
      ROLES.map((k) => fx.users[k]),
    )
  }
  await fx?.teardown()
})

/** A forged author: any user other than the caller. */
const someoneElse = (role: RoleKey) =>
  role === 'siteAdmin' ? fx.users.teacher.id : fx.users.siteAdmin.id

describe('posting', () => {
  it('refuses an anonymous topic', async () => {
    expect([401, 403]).toContain(
      (await call('POST', '/api/discussion-topics', undefined, topicBody())).status,
    )
  })

  for (const role of ROLES) {
    it(`lets a ${LABEL[role]} post a topic, stamped as them whatever the body claims`, async () => {
      const res = await call(
        'POST',
        '/api/discussion-topics',
        role,
        topicBody({ author: someoneElse(role), lastSeq: 9 }),
      )
      expect(res.status, res.text).toBe(201)
      const doc = res.body?.doc as { author: unknown; lastSeq: unknown }
      expect(doc.author).toBe(fx.users[role].id)
      expect(doc.lastSeq).toBe(0)
    })
  }

  it('refuses a missing submissionKey (400) and a repeated one (409)', async () => {
    expect(
      (
        await call(
          'POST',
          '/api/discussion-topics',
          'teacher',
          topicBody({ submissionKey: undefined }),
        )
      ).status,
    ).toBe(400)
    const submissionKey = newKey()
    expect(
      (await call('POST', '/api/discussion-topics', 'teacher', topicBody({ submissionKey })))
        .status,
    ).toBe(201)
    expect(
      (await call('POST', '/api/discussion-topics', 'teacher', topicBody({ submissionKey })))
        .status,
    ).toBe(409)
  })

  it('posts a reply over REST, numbered and starting from joinedAtSeq (JSON reaches the virtual field)', async () => {
    const topicId = await postTopic('teacher')
    const res = await call('POST', '/api/discussion-replies', 'editor', replyBody(topicId))
    expect(res.status, res.text).toBe(201)
    expect((res.body?.doc as { seq: unknown }).seq).toBe(1)
    const ahead = await call(
      'POST',
      '/api/discussion-replies',
      'editor',
      replyBody(topicId, { body: 'Too far ahead', joinedAtSeq: 7 }),
    )
    expect(ahead.status).toBe(400)
  })
})

describe('no edits, and no REST delete', () => {
  it('refuses PATCH on a topic and a reply for everyone, the Site Administrator included', async () => {
    const topicId = await postTopic('teacher')
    const reply = await call(
      'POST',
      '/api/discussion-replies',
      'teacher',
      replyBody(topicId, { body: 'Mine' }),
    )
    const replyId = (reply.body?.doc as { id: number }).id
    for (const role of ROLES) {
      expect(
        (await call('PATCH', `/api/discussion-topics/${topicId}`, role, { title: 'Changed' }))
          .status,
      ).toBe(403)
      expect(
        (await call('PATCH', `/api/discussion-replies/${replyId}`, role, { body: 'Changed' }))
          .status,
      ).toBe(403)
    }
  })

  it('refuses the REST DELETE for everyone, the Site Administrator included', async () => {
    const topicId = await postTopic('teacher')
    for (const role of ROLES) {
      expect((await call('DELETE', `/api/discussion-topics/${topicId}`, role)).status).toBe(403)
    }
  })
})

/**
 * The #376 rule over the wire, for every moderation action that does not lock the caller's own row: a Site
 * Administrator demoted, disabled or deleted while the action WAITS on the topic's lock is refused (403)
 * after the wait, and `unchanged` proves nothing was written. The holder keeps the topic locked while the
 * account change commits, so the change lands mid-wait by construction rather than by timing.
 */
function refusesAdminChangedDuringWait(
  action: 'delete' | 'pin',
  body: unknown,
  unchanged: (topic: { id: number; pinnedAt?: string | null }) => void,
) {
  for (const change of ['demoted', 'disabled', 'deleted'] as const) {
    it(`refuses an administrator ${change} while the ${action} waits on the topic`, async () => {
      const topicId = await postTopic('teacher')
      const caller = await createUserVerified(fx.payload, {
        email: `${MARK}${action}-${change}@example.test`.toLowerCase(),
        name: `${MARK}${action} ${change}`,
        password: fx.password,
        roles: ['siteAdmin'],
      })
      let deleted = false
      try {
        const callerToken = await login(caller.email, fx.password)
        let acting!: Promise<Response>
        await whileRowLocked(fx.payload, 'discussion_topics', topicId, async () => {
          acting = fetch(url(`/api/discussion-topics/${topicId}/${action}`), {
            method: 'POST',
            headers: { Authorization: `JWT ${callerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          expect(await stillPendingAfterWindow(acting)).toBe(true)
          if (change === 'deleted') {
            await fx.payload.delete({ collection: 'users', id: caller.id, overrideAccess: true })
            deleted = true
          } else {
            await fx.payload.update({
              collection: 'users',
              id: caller.id,
              data: change === 'demoted' ? { roles: [] } : { signInDisabled: true, sessions: [] },
              overrideAccess: true,
            })
          }
        })
        expect((await acting).status).toBe(403)
        unchanged(
          await fx.payload.findByID({
            collection: 'discussion-topics',
            id: topicId,
            overrideAccess: true,
          }),
        )
      } finally {
        await clearLoginTargetBudget(fx.payload, caller.email.toLowerCase())
        if (!deleted) await deleteUserFixture(fx.payload, caller.id)
      }
    }, 30_000)
  }
}

describe('whole-thread delete endpoint', () => {
  refusesAdminChangedDuringWait('delete', {}, (topic) => expect(topic.id).toBeTruthy())

  it('refuses an anonymous caller and every role but the Site Administrator', async () => {
    const topicId = await postTopic('teacher')
    expect((await deleteThread(topicId)).status).toBe(401)
    for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
      expect((await deleteThread(topicId, role)).status, LABEL[role]).toBe(403)
    }
  })

  it('lets the Site Administrator delete a thread with its replies, and 404s a missing one', async () => {
    const topicId = await postTopic('teacher')
    await call(
      'POST',
      '/api/discussion-replies',
      'editor',
      replyBody(topicId, { body: 'Goes with the thread' }),
    )
    expect((await deleteThread(topicId, 'siteAdmin')).status).toBe(200)
    const replies = await fx.payload.count({
      collection: 'discussion-replies',
      where: { topic: { equals: topicId } },
      overrideAccess: true,
    })
    expect(replies.totalDocs).toBe(0)
    expect((await deleteThread(topicId, 'siteAdmin')).status).toBe(404)
  })
})

describe('privacy under expanded reads (contract item 4)', () => {
  it('returns ids, never a populated user or lesson version, even at depth=2', async () => {
    const topicId = await postTopic('editor', { refVersion: fx.version.id })
    await call(
      'POST',
      '/api/discussion-replies',
      'editor',
      replyBody(topicId, { body: 'Reply', refVersion: fx.version.id }),
    )
    const reads = [
      await call('GET', `/api/discussion-topics/${topicId}?depth=2`, 'teacher'),
      await call(
        'GET',
        `/api/discussion-replies?where[topic][equals]=${topicId}&depth=2`,
        'teacher',
      ),
      await call('GET', `/api/discussion-participation?depth=2`, 'editor'),
    ]
    for (const res of reads) {
      expect(res.status, res.text).toBe(200)
      expect(res.text, 'no email address may appear').not.toMatch(/@/)
      expect(res.text, 'no roles or assignments may appear').not.toMatch(/"roles"|"assignments"/)
    }
    const topic = reads[0].body as { author: unknown; refVersion: unknown; refPlan: unknown }
    expect(typeof topic.author).toBe('number')
    expect(typeof topic.refVersion).toBe('number')
    expect(typeof topic.refPlan).toBe('number')
  })

  it('shows each user only their own participation', async () => {
    await postTopic('teacher')
    const res = await call('GET', '/api/discussion-participation?limit=100', 'teacher')
    expect(res.status).toBe(200)
    const docs = (res.body?.docs ?? []) as { user: unknown }[]
    expect(docs.length).toBeGreaterThan(0)
    for (const doc of docs) expect(doc.user).toBe(fx.users.teacher.id)
  })
})

describe('the off switch (3a gates)', () => {
  it('while off: nobody posts, only the Site Administrator reads and deletes, nobody reads participation', async () => {
    const topicId = await postTopic('teacher')
    await setForum(false)
    try {
      for (const role of ROLES) {
        expect(
          (await call('POST', '/api/discussion-topics', role, topicBody())).status,
          LABEL[role],
        ).toBe(403)
        expect((await call('GET', '/api/discussion-participation', role)).status, LABEL[role]).toBe(
          403,
        )
      }
      for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
        expect(
          (await call('GET', `/api/discussion-topics/${topicId}`, role)).status,
          LABEL[role],
        ).toBe(403)
      }
      expect((await call('GET', `/api/discussion-topics/${topicId}`, 'siteAdmin')).status).toBe(200)
      expect((await deleteThread(topicId, 'siteAdmin')).status).toBe(200)
    } finally {
      await setForum(true)
    }
  })
})

// ─── 3b: mark-read, pin, redaction ─────────────────────────────────────────────────────────────────

const topicAction = (topicId: number, action: string, as?: RoleKey, body: unknown = {}) =>
  call('POST', `/api/discussion-topics/${topicId}/${action}`, as, body)
const redactReply = (replyId: number, as?: RoleKey) =>
  call('POST', `/api/discussion-replies/${replyId}/redact`, as, {})

/** A topic by the Teacher with one reply by the Teacher with editing access; returns both ids. */
async function threadWithReply(): Promise<{ topicId: number; replyId: number }> {
  const topicId = await postTopic('teacher')
  const reply = await call('POST', '/api/discussion-replies', 'editor', replyBody(topicId))
  expect(reply.status, reply.text).toBe(201)
  return { topicId, replyId: (reply.body?.doc as { id: number }).id }
}

describe('mark-read endpoint (3b)', () => {
  it('refuses an anonymous caller, accepts a participant, and refuses a bad range', async () => {
    const { topicId } = await threadWithReply()
    expect(
      (await topicAction(topicId, 'mark-read', undefined, { fromSeq: 0, throughSeq: 1 })).status,
    ).toBe(401)
    const res = await topicAction(topicId, 'mark-read', 'teacher', { fromSeq: 1, throughSeq: 1 })
    expect(res.status, res.text).toBe(200)
    expect(res.body?.lastReadSeq).toBe(1)
    expect(
      (await topicAction(topicId, 'mark-read', 'teacher', { fromSeq: 2, throughSeq: 1 })).status,
    ).toBe(400)
    expect(
      (await topicAction(topicId, 'mark-read', 'teacher', { fromSeq: 0, throughSeq: 9 })).status,
    ).toBe(400)
  })
})

describe('pin endpoint (3b)', () => {
  refusesAdminChangedDuringWait('pin', { pinned: true }, (topic) =>
    expect(topic.pinnedAt ?? null).toBeNull(),
  )

  it('refuses an anonymous caller and every role but the Site Administrator', async () => {
    const topicId = await postTopic('teacher')
    expect((await topicAction(topicId, 'pin', undefined, { pinned: true })).status).toBe(401)
    for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
      expect((await topicAction(topicId, 'pin', role, { pinned: true })).status, LABEL[role]).toBe(
        403,
      )
    }
    const res = await topicAction(topicId, 'pin', 'siteAdmin', { pinned: true })
    expect(res.status, res.text).toBe(200)
    expect(res.body?.pinnedAt).toBeTruthy()
    expect((await topicAction(topicId, 'pin', 'siteAdmin', { pinned: 'yes' })).status).toBe(400)
  })
})

describe('redaction endpoints (3b)', () => {
  it('refuses an anonymous caller and every role but the Site Administrator', async () => {
    const { topicId, replyId } = await threadWithReply()
    expect((await topicAction(topicId, 'redact', undefined, { body: true })).status).toBe(401)
    expect((await redactReply(replyId)).status).toBe(401)
    for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
      expect((await topicAction(topicId, 'redact', role, { body: true })).status, LABEL[role]).toBe(
        403,
      )
      expect((await redactReply(replyId, role)).status, LABEL[role]).toBe(403)
    }
  })

  it('lets the Site Administrator redact once (200, then 409) and refuses an unknown part (400)', async () => {
    const { topicId, replyId } = await threadWithReply()
    expect((await topicAction(topicId, 'redact', 'siteAdmin', { title: true })).status).toBe(200)
    expect((await topicAction(topicId, 'redact', 'siteAdmin', { title: true })).status).toBe(409)
    expect((await topicAction(topicId, 'redact', 'siteAdmin', { author: true })).status).toBe(400)
    expect((await redactReply(replyId, 'siteAdmin')).status).toBe(200)
    expect((await redactReply(replyId, 'siteAdmin')).status).toBe(409)
    expect((await redactReply(999_999_999, 'siteAdmin')).status).toBe(404)
  })
})

describe('the off switch (3b gates)', () => {
  it('while off: no mark-read or pin for anyone; the Site Administrator can still redact', async () => {
    const { topicId, replyId } = await threadWithReply()
    await setForum(false)
    try {
      for (const role of ROLES) {
        expect(
          (await topicAction(topicId, 'mark-read', role, { fromSeq: 0, throughSeq: 0 })).status,
          LABEL[role],
        ).toBe(403)
      }
      expect((await topicAction(topicId, 'pin', 'siteAdmin', { pinned: true })).status).toBe(403)
      expect((await topicAction(topicId, 'redact', 'siteAdmin', { body: true })).status).toBe(200)
      expect((await redactReply(replyId, 'siteAdmin')).status).toBe(200)
    } finally {
      await setForum(true)
    }
  })
})

// ─── 4a: the lesson-reference picker ───────────────────────────────────────────────────────────────

describe('lesson reference picker (4a)', () => {
  // ⚑ The picker adds no endpoint: it reads Payload's own REST as the caller. What this pins is the
  // exact query the browser sends (the same builders) — above all that version authors come back NAMES
  // ONLY, never an email, roles or assignments.
  it('finds a readable lesson by title and lists its versions with the saver’s name only', async () => {
    const saved = await fx.payload.create({
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
    })
    try {
      const search = await call('GET', lessonSearchPath(`${MARK}Plan`), 'teacher')
      expect(search.status, search.text).toBe(200)
      expect((search.body?.docs as { id: number }[]).map((d) => d.id)).toContain(fx.plan.id)

      const versions = await call('GET', lessonVersionsPath(fx.plan.id), 'teacher')
      expect(versions.status, versions.text).toBe(200)
      const row = (versions.body?.docs as { id: number; author?: unknown }[]).find(
        (d) => d.id === saved.id,
      )
      // Exactly the id, the name, and Payload's own `collection` marker on a populated document.
      expect(row?.author, JSON.stringify(row?.author)).toEqual({
        id: fx.users.editor.id,
        name: fx.users.editor.name,
        collection: 'users',
      })
      expect(versions.text).not.toContain(fx.users.editor.email)
      expect(versions.text).not.toMatch(/"(email|roles|assignments)"/)
    } finally {
      await fx.payload.delete({
        collection: 'lesson-bundle-versions',
        id: saved.id,
        overrideAccess: true,
      })
    }
  })
})

// ─── Review of #380: the navigation's forum check ──────────────────────────────────────────────────

describe('GET /api/discussion-topics/nav-state', () => {
  // ⚑ The navigation asks this after each soft navigation instead of re-rendering the whole route, and
  // refreshes only when the answer differs. It must say exactly what the nav shows — no more — for the
  // caller only, never from a cache, and it must say "off" for everyone while the switch is off.
  const navState = (as?: RoleKey) => call('GET', '/api/discussion-topics/nav-state', as)

  it('refuses an anonymous caller', async () => {
    expect((await navState()).status).toBe(401)
  })

  it('answers the caller’s own state, and only the two fields the nav shows', async () => {
    for (const role of ROLES) {
      const res = await navState(role)
      expect(res.status, LABEL[role]).toBe(200)
      expect(Object.keys(res.body ?? {}).sort(), LABEL[role]).toEqual(['forumEnabled', 'unread'])
      expect(res.body?.forumEnabled, LABEL[role]).toBe(true)
    }
    const raw = await fetch(url('/api/discussion-topics/nav-state'), {
      headers: { Authorization: `JWT ${token.teacher}` },
    })
    expect(raw.headers.get('cache-control')).toContain('no-store')
  })

  it('reports a reply by someone else as unread, and clears once it is read', async () => {
    // A fresh account, so the only thread it takes part in is this one (the fixture users take part
    // in many by now, which would make "unread" true for reasons outside this test).
    const reader = await createUserVerified(fx.payload, {
      email: `${MARK}nav-state@example.test`.toLowerCase(),
      name: `${MARK}Nav state`,
      password: fx.password,
    })
    try {
      const readerToken = await login(reader.email, fx.password)
      const asReader = (method: 'GET' | 'POST', path: string, body?: unknown) =>
        fetch(url(path), {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `JWT ${readerToken}` },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }).then(async (r) => ({ status: r.status, body: await r.json() }))

      expect((await asReader('GET', '/api/discussion-topics/nav-state')).body.unread).toBe(false)
      const topic = await asReader('POST', '/api/discussion-topics', topicBody())
      expect(topic.status).toBe(201)
      const topicId = topic.body.doc.id as number
      const reply = await call('POST', '/api/discussion-replies', 'editor', replyBody(topicId))
      expect(reply.status, reply.text).toBe(201)
      expect((await asReader('GET', '/api/discussion-topics/nav-state')).body.unread).toBe(true)

      const read = await asReader('POST', `/api/discussion-topics/${topicId}/mark-read`, {
        fromSeq: 0,
        throughSeq: 1,
      })
      expect(read.status).toBe(200)
      expect((await asReader('GET', '/api/discussion-topics/nav-state')).body.unread).toBe(false)
    } finally {
      await clearLoginTargetBudget(fx.payload, reader.email.toLowerCase())
      await clearPostingCaps(fx.payload, [reader])
      await deleteUserFixture(fx.payload, reader.id)
    }
  })

  it('answers "off" for every role while the forum is switched off, the Site Administrator included', async () => {
    await setForum(false)
    try {
      for (const role of ROLES) {
        const res = await navState(role)
        expect(res.status, LABEL[role]).toBe(200)
        expect(res.body, LABEL[role]).toEqual({ forumEnabled: false, unread: false })
      }
    } finally {
      await setForum(true)
    }
  })
})
