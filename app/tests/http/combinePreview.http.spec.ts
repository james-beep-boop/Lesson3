/**
 * GET /api/lesson-bundle-versions/:id/combine-preview?with=:otherId over the WIRE (SPEC §6, phase 2).
 *
 * CLAUDE.md's standing rule: a custom endpoint ships with wire-level 401/403/404 plus the happy path
 * in the same PR. This one writes nothing, but it reads three versions' full content with the
 * caller's access, so the gate order is pinned like any other:
 *
 *   G   401 unauthenticated; 400 for a missing, malformed or identical `with`; 404 for either version
 *       missing; 400 for versions of different plans; 403 for a caller without editing access
 *   H1  two siblings with edits in different fields: B's edit arrives as an overlay keyed by A's
 *       rows, with their parent named as the ancestor
 *   H2  the same field edited differently is a conflict carrying all three texts
 *   H3  a different structure is a 200 refusal with a message, not an error
 *   H4  versions with no recorded common ancestor are combined two-way
 *
 * The engine's rules are pinned in `tests/unit/combineEngine.spec.ts`; these cases prove the endpoint
 * finds the ancestor and hands the engine real stored documents (row ids regenerated per version).
 *
 * Runs against the app the compose stack serves; see the header of `endpoints.http.spec.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed (${res.status}) for ${email}`)
  return ((await res.json()) as { token: string }).token
}

const preview = (id: number | string, withId: number | string | null, as?: RoleKey) =>
  fetch(
    `${BASE}/api/lesson-bundle-versions/${id}/combine-preview${withId === null ? '' : `?with=${withId}`}`,
    { headers: as ? { Authorization: `JWT ${token[as]}` } : {} },
  )

type Content = ReturnType<typeof minimalBundleContent>

/** A version of the fixture plan, edited from the minimal bundle, optionally based on a parent. */
async function makeVersion(
  semver: string,
  edit: (c: Content) => void = () => {},
  opts: { sourceVersion?: number | null; planId?: number } = {},
): Promise<number> {
  const c = minimalBundleContent()
  edit(c)
  const v = (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: opts.planId ?? fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      // ONE title for every version, as `save-as-new` copies it from the source. The version title is
      // administrator content, so per-version titles would make every pair look like two
      // administrator edits and be refused — which is the engine working, and not what these test.
      title: `${MARK}Combine plan`,
      ...(opts.sourceVersion === null
        ? {}
        : { sourceVersion: opts.sourceVersion ?? fx.version.id }),
      ...c,
    } as never,
    overrideAccess: true,
  })) as { id: number }
  return v.id
}

async function lessonRowId(versionId: number): Promise<string> {
  const v = (await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: versionId,
    depth: 0,
    overrideAccess: true,
  })) as { lessons: { id: string }[] }
  return v.lessons[0].id
}

let siblingA: number
let siblingB: number

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens = await Promise.all(ROLES.map((key) => login(fx.users[key].email, fx.password)))
  ROLES.forEach((key, i) => (token[key] = tokens[i]))
  siblingA = await makeVersion('3.0.1', (c) => (c.lessons[0].overview = 'Overview edited by A.'))
  siblingB = await makeVersion(
    '3.0.2',
    (c) => (c.lessons[0].teacherReflection = 'Reflection edited by B.'),
  )
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('G — the gate', () => {
  it('401 when not signed in', async () => {
    expect((await preview(siblingA, siblingB)).status).toBe(401)
  })

  it.each([
    ['missing', null],
    ['malformed', 'abc'],
    ['the same version', 'SELF'],
  ])('400 when `with` is %s', async (_label, withId) => {
    const res = await preview(siblingA, withId === 'SELF' ? siblingA : withId, 'editor')
    expect(res.status).toBe(400)
  })

  it('404 when either version does not exist', async () => {
    expect((await preview(999_999_999, siblingB, 'editor')).status).toBe(404)
    expect((await preview(siblingA, 999_999_999, 'editor')).status).toBe(404)
  })

  it('400 when the versions belong to different plans', async () => {
    const otherPlan = (await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}Combine other plan`, subjectGrade: fx.subjectGrade.id },
      overrideAccess: true,
    })) as { id: number }
    const elsewhere = await makeVersion('1.0.0', () => {}, {
      planId: otherPlan.id,
      sourceVersion: null,
    })
    expect((await preview(siblingA, elsewhere, 'editor')).status).toBe(400)
  })

  it('403 for a signed-in Teacher without editing access', async () => {
    const res = await preview(siblingA, siblingB, 'teacher')
    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty('plan')
  })
})

describe('H — the happy paths', () => {
  it('H1 siblings: B’s edit arrives keyed by A’s rows, with their parent as ancestor', async () => {
    const res = await preview(siblingA, siblingB, 'editor')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      a: { id: number }
      b: { id: number }
      base: { id: number } | null
      plan: { ok: boolean; start: string; ancestry: string; overlay: unknown; conflicts: unknown[] }
    }
    expect(body.a.id).toBe(siblingA)
    expect(body.b.id).toBe(siblingB)
    expect(body.base?.id).toBe(fx.version.id)
    expect(body.plan).toMatchObject({ ok: true, start: 'a', ancestry: 'three-way', conflicts: [] })
    expect(body.plan.overlay).toEqual({
      [`lesson:${await lessonRowId(siblingA)}`]: { teacherReflection: 'Reflection edited by B.' },
    })
  })

  it('H2 the same field edited differently is a conflict with all three texts', async () => {
    const a = await makeVersion('3.1.1', (c) => (c.lessons[0].overview = 'A says this.'))
    const b = await makeVersion('3.1.2', (c) => (c.lessons[0].overview = 'B says that.'))
    const body = (await (await preview(a, b, 'subjectAdmin')).json()) as {
      plan: { conflicts: { field: string; base: string; a: string; b: string; reason: string }[] }
    }
    expect(body.plan.conflicts).toEqual([
      expect.objectContaining({
        field: 'overview',
        base: 'A minimal generatable lesson.',
        a: 'A says this.',
        b: 'B says that.',
        reason: 'both-edited',
      }),
    ])
  })

  it('H3 a different structure is a 200 refusal that says why', async () => {
    const wider = await makeVersion('3.2.1', (c) => c.lessons.push({ ...c.lessons[0] }))
    const res = await preview(siblingA, wider, 'editor')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { plan: { ok: boolean; refusal: string; message: string } }
    expect(body.plan).toMatchObject({ ok: false, refusal: 'structure' })
    expect(body.plan.message).toMatch(/different lessons/)
  })

  it('H4 no recorded common ancestor: every difference is a choice', async () => {
    const a = await makeVersion('3.3.1', (c) => (c.lessons[0].overview = 'Orphan A.'), {
      sourceVersion: null,
    })
    const b = await makeVersion('3.3.2', () => {}, { sourceVersion: null })
    const body = (await (await preview(a, b, 'editor')).json()) as {
      base: unknown
      plan: { ancestry: string; overlay: unknown; conflicts: { reason: string }[] }
    }
    expect(body.base).toBeNull()
    expect(body.plan.ancestry).toBe('two-way')
    expect(body.plan.overlay).toEqual({})
    expect(body.plan.conflicts.map((c) => c.reason)).toEqual(['no-ancestor'])
  })
})
