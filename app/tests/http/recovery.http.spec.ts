/**
 * Edit-recovery endpoints over the WIRE — SEVEN operations across FIVE URL paths (design §2's table
 * lists five rows; it bundles metadata and cleanup, and predates op 7, the delete warning's count,
 * added 2026-10-17). The wire-authz rule counts OPERATIONS, which is why this file runs its matrix
 * seven times.
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
 *   S5  a malformed `document` is refused AND the previously captured prose survives it
 *   S6  op 7 discloses COUNTS only, only to someone allowed to delete the version, and separates the
 *       caller from everyone else
 *
 * ⚑ **What this file deliberately does NOT own.** The body guards themselves — `requireDocument`,
 * `requireCounter` and the `Content-Length` ceiling — are pure HTTP semantics and are unit tested in
 * `tests/unit/recoveryParse.spec.ts`, which runs without a database or a served app. S5 is here
 * because its subject is not the status code but the surviving row. The 4 MB raw-body ceiling has no
 * wire case for the same reason in reverse: sending 4 MB over the wire would prove nothing the unit
 * test does not, and the guard's real assertion — that the body was never read — is invisible from
 * out here.
 *
 * Runs against the app the compose stack serves; see the header of `endpoints.http.spec.ts`.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'
import { drizzleOf } from '../helpers/db'

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
 * The seven operations, as data. Each row is one operation; every one owes 401 and wrong-role, which is
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
  {
    name: '7 GET /recovery/unsaved-count',
    path: '/recovery/unsaved-count',
    method: 'GET',
    // Gated on DELETE permission. `sharedVersionId` has no author, so the teacher with editing access
    // may not delete it — the denial is the editing-access holder, not only the plain Teacher, which
    // proves the gate is the delete rule and not the edit rule.
    allowed: 'subjectAdmin',
    denied: { as: 'editor', status: 403 },
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
      capture: {
        content: Record<string, Record<string, string>>
        capturedAt: string
        baseUpdatedAt: string
      }
      token: { updatedAt: string }
    }
    expect(got.capture.content['lesson:L1'].title).toBe('unsaved over the wire')

    /**
     * ⚑ TWO timestamps, and the restore prompt shows one of them to a teacher. `capturedAt` is the
     * recovery ROW's mtime — when this prose was stored; `baseUpdatedAt` is the SOURCE VERSION's, and
     * exists only so the client can detect that the plan moved underneath the capture. The client
     * originally reassembled `capturedAt` from the token, and an earlier build of the panel printed
     * `baseUpdatedAt` under "Captured …", telling a teacher their afternoon's work dated from whenever
     * the plan was last saved.
     *
     * Asserted at the wire because it IS a wire fact, and because the client now refuses any capture
     * that arrives without it — so an endpoint that stopped sending it would present as "no work was
     * recovered", which is indistinguishable from there being none.
     */
    expect(got.capture.capturedAt, 'the capture must be datable').toBeTruthy()
    expect(got.capture.capturedAt, 'and it is the ROW mtime the token also carries').toBe(
      got.token.updatedAt,
    )
    expect(
      Date.parse(got.capture.capturedAt),
      'stored after the source it was captured against',
    ).toBeGreaterThanOrEqual(Date.parse(got.capture.baseUpdatedAt))
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

  /**
   * ⚑ The regression guard for the data-destroying half of `206252a`, and the half a unit test cannot
   * reach. `tests/unit/recoveryParse.spec.ts` owns the 400 itself — that `requireDocument` rejects
   * each malformed shape. What only a real request against a real row can show is the CONSEQUENCE:
   * that the rejected capture left the previously captured prose, and the revision, exactly as they
   * were. Before the fix each of these projected to `{}` and SUCCEEDED, so the client got a 200 while
   * the backup it was protecting became empty.
   */
  it('S5 — a malformed `document` is refused AND the prior capture survives', async () => {
    const v = await makeVersion('2.1.1')
    const t = await startAs(v, 'editor')

    // A good backup exists first — otherwise "nothing was destroyed" is trivially true.
    const good = await call(v, '/recovery', 'POST', 'editor', {
      generation: t.generation,
      expectedRevision: t.revision,
      document: { lessons: [{ id: 'L1', title: 'work worth keeping' }] },
    })
    expect(good.status, 'fixture: the good capture must land').toBe(200)
    const kept = (await good.json()) as { token: { generation: number; revision: number } }

    // ONE shape, not a matrix. `null` is the shape the pre-fix `payload.document ?? null` actually
    // produced, and every rejected shape fails at the same guard, so the four-way table lives in
    // `recoveryParse.spec.ts` where it costs nothing. What is proven HERE is the consequence.
    const bad = await call(v, '/recovery', 'POST', 'editor', {
      generation: kept.token.generation,
      expectedRevision: kept.token.revision, // a VALID token — the body is what is wrong
      document: null,
    })
    expect(bad.status, 'a malformed document is a 400, never a successful overwrite').toBe(400)

    const after = (await (await call(v, '/recovery', 'GET', 'editor')).json()) as {
      capture: { content: Record<string, Record<string, string>> }
      token: { revision: number }
    }
    expect(after.capture.content['lesson:L1'].title).toBe('work worth keeping')
    // The revision must not have advanced either: a rejected write is not a write.
    expect(after.token.revision).toBe(kept.token.revision)
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

/**
 * S6 — op 7, the count behind the delete confirmations' warning (SPEC §5, "Keep for later").
 *
 * The matrix above proves the gate runs. These prove what crosses it: two numbers and nothing else,
 * the delete rule's author path (a teacher with editing access deleting their OWN version), and the
 * caller kept apart from everyone else.
 */
describe('S6 — op 7 discloses counts, only to someone who may delete', () => {
  /** A version AUTHORED by the editor, so the author path of the delete rule applies. */
  async function makeAuthoredVersion(semver: string): Promise<number> {
    const v = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver,
        author: fx.users.editor.id,
        title: `${MARK}HTTP-${semver}`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as { id: number }
    return v.id
  }

  async function keepWorkAs(versionId: number, as: RoleKey) {
    const t = await startAs(versionId, as)
    const res = await call(versionId, '/recovery', 'POST', as, {
      generation: t.generation,
      expectedRevision: t.revision,
      document: { lessons: [{ id: 'L1', title: `kept by ${as}` }] },
    })
    expect(res.status, 'fixture: capture must succeed').toBe(200)
  }

  const countAs = async (versionId: number, as: RoleKey) => {
    const res = await call(versionId, '/recovery/unsaved-count', 'GET', as)
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }

  it('an empty version: zero, and the body is exactly the two counts', async () => {
    const v = await makeAuthoredVersion('2.7.1')
    const { status, body } = await countAs(v, 'subjectAdmin')
    expect(status).toBe(200)
    expect(body).toEqual({ otherUsers: 0, includesCaller: false })
  })

  it('separates the caller from everyone else, and names nobody', async () => {
    const v = await makeAuthoredVersion('2.7.2')
    await keepWorkAs(v, 'editor')
    await keepWorkAs(v, 'subjectAdmin')

    const admin = await countAs(v, 'siteAdmin')
    expect(admin.body).toEqual({ otherUsers: 2, includesCaller: false })
    // The author path: a teacher with editing access may delete their own version, so may ask.
    const author = await countAs(v, 'editor')
    expect(author.status).toBe(200)
    expect(author.body).toEqual({ otherUsers: 1, includesCaller: true })
    expect(Object.keys(author.body).sort()).toEqual(['includesCaller', 'otherUsers'])
  })

  it('a plain Teacher is refused even where unsaved work exists', async () => {
    const v = await makeAuthoredVersion('2.7.3')
    await keepWorkAs(v, 'editor')
    const { status, body } = await countAs(v, 'teacher')
    expect(status).toBe(403)
    expect(body).not.toHaveProperty('otherUsers')
  })
})

describe('Combine draft metadata over the wire', () => {
  it('round trips owner-only metadata and excludes a cross-plan second parent on restore', async () => {
    const source = await makeVersion('7.0.1')
    const other = await makeVersion('7.0.2')
    const held = await startAs(source, 'editor')
    const captured = await call(source, '/recovery', 'POST', 'editor', {
      generation: held.generation,
      expectedRevision: held.revision,
      document: minimalBundleContent(),
      combineContext: { mergeParent: other, resolvedKeys: [] },
    })
    expect(captured.status).toBe(200)
    const restored = await (await call(source, '/recovery', 'GET', 'editor')).json()
    expect(restored.capture.combineContext).toEqual({ mergeParent: other, resolvedKeys: [] })
    expect(await (await call(source, '/recovery', 'GET', 'subjectAdmin')).json()).toEqual({
      capture: null,
    })
    const foreignPlan = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}foreign combine`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })
    const foreign = await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...minimalBundleContent(),
        lessonPlan: foreignPlan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.1',
        title: `${MARK}foreign combine`,
      } as never,
      overrideAccess: true,
    })
    try {
      const next = (await captured.json()).token
      const rejected = await call(source, '/recovery', 'POST', 'editor', {
        generation: next.generation,
        expectedRevision: next.revision,
        document: minimalBundleContent(),
        combineContext: { mergeParent: foreign.id, resolvedKeys: [] },
      })
      expect(rejected.status).toBe(200)
      // Metadata never blocks prose capture. The stored id is the owner's own note: restore returns
      // it, and combine-preview — the one gate for the pair — refuses it, so the client continues
      // with an ordinary draft.
      await drizzleOf(fx.payload).execute(
        sql`UPDATE edit_recovery SET combine_context = ${JSON.stringify({ mergeParent: foreign.id, resolvedKeys: [] })}::jsonb WHERE user_id = ${fx.users.editor.id} AND source_version_id = ${source}`,
      )
      const forged = await (await call(source, '/recovery', 'GET', 'editor')).json()
      expect(forged.capture.combineContext).toEqual({ mergeParent: foreign.id, resolvedKeys: [] })
      expect(forged.capture.content).toBeTruthy()
      expect(
        (await call(source, `/combine-preview?with=${foreign.id}`, 'GET', 'editor')).status,
      ).toBe(400)
      await drizzleOf(fx.payload).execute(
        sql`UPDATE edit_recovery SET combine_context = ${JSON.stringify({ mergeParent: other, resolvedKeys: [] })}::jsonb WHERE user_id = ${fx.users.editor.id} AND source_version_id = ${source}`,
      )

      expect(
        (await (await call(source, '/recovery', 'GET', 'editor')).json()).capture.combineContext
          .mergeParent,
      ).toBe(other)
    } finally {
      await fx.payload.delete({
        collection: 'lesson-plans',
        id: foreignPlan.id,
        overrideAccess: true,
      })
    }
    await fx.payload.delete({
      collection: 'lesson-bundle-versions',
      id: other,
      overrideAccess: true,
    })
    // A deleted second parent: the prose is still offered, and the preview's 404 is what tells the
    // client to continue as an ordinary draft.
    const fallback = await (await call(source, '/recovery', 'GET', 'editor')).json()
    expect(fallback.capture.content).toBeTruthy()
    expect((await call(source, `/combine-preview?with=${other}`, 'GET', 'editor')).status).toBe(404)
    await fx.payload.delete({
      collection: 'lesson-bundle-versions',
      id: source,
      overrideAccess: true,
    })
    expect((await call(source, '/recovery', 'GET', 'editor')).status).toBe(404)
  })
})

it('restore neither needs nor spends the shared preview budget', async () => {
  const source = await makeVersion('7.1.1')
  const other = await makeVersion('7.1.2')
  const held = await startAs(source, 'editor')
  expect(
    (
      await call(source, '/recovery', 'POST', 'editor', {
        generation: held.generation,
        expectedRevision: held.revision,
        document: { lessons: [{ id: 'own', overview: 'Prose survives a preview limit' }] },
        combineContext: { mergeParent: other, resolvedKeys: [] },
      })
    ).status,
  ).toBe(200)
  const key = `preview:${fx.users.editor.id}`
  try {
    await drizzleOf(fx.payload)
      .execute(sql`INSERT INTO rate_limit_counters (bucket_key, window_start, count)
      VALUES (${key}, floor(extract(epoch FROM now()) * 1000 / 60000) * 60000, 1000000)
      ON CONFLICT (bucket_key) DO UPDATE SET window_start = EXCLUDED.window_start, count = EXCLUDED.count`)
    const res = await call(source, '/recovery', 'GET', 'editor')
    expect(res.status).toBe(200)
    // The note comes back intact, so the client can retry the preview once the budget allows —
    // a rate limit no longer turns the draft into an ordinary one.
    expect((await res.json()).capture).toMatchObject({
      combineContext: { mergeParent: other, resolvedKeys: [] },
      content: { 'lesson:own': { overview: 'Prose survives a preview limit' } },
    })
    // Capture uses its own recovery budget and never runs the blocked comparison.
    const current = await call(source, '/recovery', 'GET', 'editor')
    const next = (await current.json()).token
    expect(
      (
        await call(source, '/recovery', 'POST', 'editor', {
          generation: next.generation,
          expectedRevision: next.revision,
          document: { lessons: [{ id: 'own', overview: 'New prose saved under preview limit' }] },
          combineContext: { mergeParent: other, resolvedKeys: [] },
        })
      ).status,
    ).toBe(200)
  } finally {
    await drizzleOf(fx.payload).execute(
      sql`DELETE FROM rate_limit_counters WHERE bucket_key = ${key}`,
    )
  }
})
