/**
 * Edit-recovery endpoints over the WIRE — five paths, SIX operations (design §2).
 *
 * CLAUDE.md's standing rule is that a custom endpoint ships with wire-level 401/403/404 plus happy
 * path in the same PR, because these handlers authorize the caller and then write with
 * `overrideAccess` — a pattern that is only as safe as the test proving the gate runs first.
 *
 * ⚑ The status-code matrix is the EASY half. The four properties below it are the ones a
 * 401/403/404 suite cannot see, and they are where the actual guarantees live:
 *
 *   S1  ops 1-4 key on the SESSION user, so a caller cannot reach another user's capture at all
 *   S2  the Site-Admin metadata view never returns content
 *   S3  GET returns only the caller's own row, even when others hold captures on the same version
 *   S4  cleanup is Site-Admin-only AND carries a revision, so a capture that changed between
 *       looking and acting is refused
 *
 * Runs against the app the compose stack serves; see the header of `endpoints.http.spec.ts`.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'

const BASE = (process.env.E2E_BASE_URL ?? 'http://app:3000').replace(/\/$/, '')
const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

let fx: RoleFixture
const token: Record<string, string> = {}

const url = (path: string) => `${BASE}${path}`
const auth = (key?: RoleKey): Record<string, string> =>
  key && token[key] ? { Authorization: `JWT ${token[key]}` } : {}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(url('/api/users/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed (${res.status}) for ${email}`)
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error(`login returned no token for ${email}`)
  return body.token
}

/** One request against a version's recovery surface. */
const call = (versionId: number, path: string, method: string, as?: RoleKey, payload?: unknown) =>
  fetch(url(`/api/lesson-bundle-versions/${versionId}${path}`), {
    method,
    headers: { 'Content-Type': 'application/json', ...auth(as) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })

let sharedVersionId: number

async function makeVersion(semver: string): Promise<number> {
  const v = (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      title: `${MARK}HTTP-${semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as { id: number }
  return v.id
}

/** Start a session as `as`, returning its token — the state most operations need. */
async function startAs(versionId: number, as: RoleKey) {
  const res = await call(versionId, '/recovery/start', 'POST', as, {})
  expect(res.status, 'fixture: start must succeed').toBe(200)
  return ((await res.json()) as { token: { generation: number; revision: number } }).token
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens = await Promise.all(ROLES.map((key) => login(fx.users[key].email, fx.password)))
  ROLES.forEach((key, i) => (token[key] = tokens[i]))
  sharedVersionId = await makeVersion('2.0.1')
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

/**
 * The six operations, as data. Each row is one operation; every one owes 401 and wrong-role, which is
 * the rule's actual unit — an earlier reading of the design counted five, because §2's table bundles
 * metadata and cleanup on a single line.
 */
const OPERATIONS: {
  name: string
  path: string
  method: string
  /** The role that MAY call it. */
  allowed: RoleKey
  /** A role that may not, and the status it should get. */
  denied: { as: RoleKey; status: number }
  payload?: unknown
}[] = [
  {
    name: '1 POST /recovery/start',
    path: '/recovery/start',
    method: 'POST',
    allowed: 'editor',
    denied: { as: 'teacher', status: 404 },
    payload: {},
  },
  {
    name: '2 POST /recovery (capture)',
    path: '/recovery',
    method: 'POST',
    allowed: 'editor',
    denied: { as: 'teacher', status: 404 },
    payload: { generation: 1, expectedRevision: 1, document: { lessons: [] } },
  },
  {
    name: '3 GET /recovery',
    path: '/recovery',
    method: 'GET',
    allowed: 'editor',
    denied: { as: 'teacher', status: 404 },
  },
  {
    name: '4 DELETE /recovery (discard)',
    path: '/recovery',
    method: 'DELETE',
    allowed: 'editor',
    denied: { as: 'teacher', status: 404 },
    payload: { generation: 1, expectedRevision: 1 },
  },
  {
    name: '5 GET /recovery/meta',
    path: '/recovery/meta',
    method: 'GET',
    allowed: 'siteAdmin',
    // A Site-Admin-only surface: the caller is a known user being told they are not an administrator,
    // so 403 rather than the 404 ops 1-4 use to avoid confirming a version exists.
    denied: { as: 'editor', status: 403 },
  },
  {
    name: '6 POST /recovery/meta/cleanup',
    path: '/recovery/meta/cleanup',
    method: 'POST',
    allowed: 'siteAdmin',
    denied: { as: 'editor', status: 403 },
    payload: { userId: 1, expectedRevision: 1 },
  },
]

describe('recovery endpoints: every operation is gated', () => {
  it.each(OPERATIONS)('$name → 401 unauthenticated', async ({ path, method, payload }) => {
    const res = await call(sharedVersionId, path, method, undefined, payload)
    expect(res.status).toBe(401)
  })

  it.each(OPERATIONS)(
    '$name → denied for the wrong role',
    async ({ path, method, denied, payload }) => {
      const res = await call(sharedVersionId, path, method, denied.as, payload)
      expect(res.status).toBe(denied.status)
    },
  )

  it.each(OPERATIONS)(
    '$name → 404 for a version that does not exist',
    async ({ path, method, allowed, payload }) => {
      const res = await call(999_999_999, path, method, allowed, payload)
      expect(res.status).toBe(404)
    },
  )
})

describe('recovery endpoints: the happy paths', () => {
  it('1 start → 200 with a token, and 3 GET reflects it', async () => {
    const v = await makeVersion('2.0.2')
    const startRes = await call(v, '/recovery/start', 'POST', 'editor', {})
    expect(startRes.status).toBe(200)
    const { token: t } = (await startRes.json()) as {
      token: { generation: number; revision: number }
    }
    expect(t).toMatchObject({ generation: 1, revision: 1 })

    const getRes = await call(v, '/recovery', 'GET', 'editor')
    expect(getRes.status).toBe(200)
    const got = (await getRes.json()) as { capture: { content: unknown } | null }
    expect(got.capture, 'a started session exists with no content yet').not.toBeNull()
  })

  it('2 capture → 200 with the ADVANCED token, and the prose comes back on GET', async () => {
    const v = await makeVersion('2.0.3')
    const t = await startAs(v, 'editor')

    const capRes = await call(v, '/recovery', 'POST', 'editor', {
      generation: t.generation,
      expectedRevision: t.revision,
      document: { lessons: [{ id: 'L1', title: 'unsaved over the wire' }] },
    })
    expect(capRes.status).toBe(200)
    const capBody = (await capRes.json()) as { token: { revision: number } }
    expect(capBody.token.revision, 'the advanced token, not the one sent').toBe(t.revision + 1)

    const got = (await (await call(v, '/recovery', 'GET', 'editor')).json()) as {
      capture: { content: Record<string, Record<string, string>> }
    }
    expect(got.capture.content['lesson:L1'].title).toBe('unsaved over the wire')
  })

  it('2 capture → 409 on a stale token, without disclosing which precondition failed', async () => {
    const v = await makeVersion('2.0.4')
    const t = await startAs(v, 'editor')
    await call(v, '/recovery', 'POST', 'editor', {
      generation: t.generation,
      expectedRevision: t.revision,
      document: { lessons: [] },
    })

    const stale = await call(v, '/recovery', 'POST', 'editor', {
      generation: t.generation,
      expectedRevision: t.revision, // already used
      document: { lessons: [] },
    })
    expect(stale.status).toBe(409)
    const body = JSON.stringify(await stale.json())
    // The message must not name the failing term — that would leak whether another session exists.
    expect(body).not.toMatch(/generation|revision|retired/i)
  })

  it('4 discard → 200, and the capture is gone from GET', async () => {
    const v = await makeVersion('2.0.5')
    const t = await startAs(v, 'editor')

    const del = await call(v, '/recovery', 'DELETE', 'editor', {
      generation: t.generation,
      expectedRevision: t.revision,
    })
    expect(del.status).toBe(200)

    const got = (await (await call(v, '/recovery', 'GET', 'editor')).json()) as { capture: null }
    expect(got.capture, 'a retired row is not shown to anyone').toBeNull()
  })

  it('rejects a malformed token field with 400 rather than coercing it', async () => {
    const v = await makeVersion('2.0.6')
    await startAs(v, 'editor')
    const res = await call(v, '/recovery', 'POST', 'editor', {
      generation: true, // Number(true) === 1 would have been accepted by a laxer check
      expectedRevision: 1,
      document: { lessons: [] },
    })
    expect(res.status).toBe(400)
  })
})

describe('recovery endpoints: the guarantees a status-code matrix cannot see', () => {
  /**
   * S1 + S3. The editor and the subject admin both hold captures on the SAME version. Neither can see
   * or touch the other's, because ops 1-4 have nowhere to name a user — the row is keyed on the
   * session. This is SPEC §13's cross-user rule and matrix case 5.
   */
  it('S1/S3 — each caller sees only their OWN capture on a shared version', async () => {
    const v = await makeVersion('2.0.7')

    const editorToken = await startAs(v, 'editor')
    await call(v, '/recovery', 'POST', 'editor', {
      generation: editorToken.generation,
      expectedRevision: editorToken.revision,
      document: { lessons: [{ id: 'L1', title: 'EDITOR private text' }] },
    })

    const adminToken = await startAs(v, 'subjectAdmin')
    await call(v, '/recovery', 'POST', 'subjectAdmin', {
      generation: adminToken.generation,
      expectedRevision: adminToken.revision,
      document: { lessons: [{ id: 'L1', title: 'ADMIN private text' }] },
    })

    const editorSees = JSON.stringify(await (await call(v, '/recovery', 'GET', 'editor')).json())
    const adminSees = JSON.stringify(
      await (await call(v, '/recovery', 'GET', 'subjectAdmin')).json(),
    )

    expect(editorSees).toContain('EDITOR private text')
    expect(editorSees, "one user's unsaved work must never reach another").not.toContain(
      'ADMIN private text',
    )
    expect(adminSees).toContain('ADMIN private text')
    expect(adminSees).not.toContain('EDITOR private text')
  })

  /**
   * S2. A Site Admin gets existence, size and revision — never a character of the prose. The kernel
   * does not even SELECT the content column, so this is structural rather than a strip step that a
   * later edit could drop.
   */
  it('S2 — the Site-Admin metadata view returns no content, only shape', async () => {
    const v = await makeVersion('2.0.8')
    const t = await startAs(v, 'editor')
    await call(v, '/recovery', 'POST', 'editor', {
      generation: t.generation,
      expectedRevision: t.revision,
      document: { lessons: [{ id: 'L1', title: 'SECRET teacher prose' }] },
    })

    const res = await call(v, '/recovery/meta', 'GET', 'siteAdmin')
    expect(res.status).toBe(200)
    const raw = JSON.stringify(await res.json())

    expect(raw, 'the prose must not appear anywhere in the response').not.toContain(
      'SECRET teacher prose',
    )
    expect(raw).not.toContain('"content"')
    // ...but the operator does get what they legitimately need.
    expect(raw).toMatch(/"revision":/)
    expect(raw).toMatch(/"bytes":/)
  })

  /**
   * S4. Cleanup carries the revision the metadata view reported, so an operator cannot clear a
   * capture that the teacher changed between looking and acting.
   */
  it('S4 — cleanup with a stale revision is refused; with the current one it retires', async () => {
    const v = await makeVersion('2.0.9')
    const t = await startAs(v, 'editor')
    await call(v, '/recovery', 'POST', 'editor', {
      generation: t.generation,
      expectedRevision: t.revision,
      document: { lessons: [{ id: 'L1', title: 'still being typed' }] },
    })

    const seen = (await (await call(v, '/recovery/meta', 'GET', 'siteAdmin')).json()) as {
      captures: { userId: number; revision: number }[]
    }
    const mine = seen.captures.find((c) => c.userId === fx.users.editor.id)
    expect(mine, 'the admin can see the capture exists').toBeTruthy()
    if (!mine) return

    // The teacher types again after the admin looked.
    const after = (await (await call(v, '/recovery', 'GET', 'editor')).json()) as {
      token: { generation: number; revision: number }
    }
    await call(v, '/recovery', 'POST', 'editor', {
      generation: after.token.generation,
      expectedRevision: after.token.revision,
      document: { lessons: [{ id: 'L1', title: 'typed after the admin looked' }] },
    })

    const staleCleanup = await call(v, '/recovery/meta/cleanup', 'POST', 'siteAdmin', {
      userId: fx.users.editor.id,
      expectedRevision: mine.revision,
    })
    expect(staleCleanup.status, 'what changed between looking and acting survives').toBe(409)

    // With the CURRENT revision it succeeds.
    const fresh = (await (await call(v, '/recovery/meta', 'GET', 'siteAdmin')).json()) as {
      captures: { userId: number; revision: number }[]
    }
    const now = fresh.captures.find((c) => c.userId === fx.users.editor.id)
    const ok = await call(v, '/recovery/meta/cleanup', 'POST', 'siteAdmin', {
      userId: fx.users.editor.id,
      expectedRevision: now?.revision,
    })
    expect(ok.status).toBe(200)

    const gone = (await (await call(v, '/recovery', 'GET', 'editor')).json()) as { capture: null }
    expect(gone.capture, 'the admin retired it').toBeNull()
  })
})
