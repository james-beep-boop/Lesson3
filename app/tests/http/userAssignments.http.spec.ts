/**
 * Wire-level authorization for the role-assignment endpoints (`endpoints/userAssignments.ts`).
 *
 * ⚑ THE D6a GUARD IS THE POINT OF THIS FILE. The operator decision (2026-08-16) is that only a Site
 * Administrator may appoint or vacate a Subject Administrator, and the design doc is blunt that
 * hiding the picker is not the fix: "a wire-level test proving a Subject Admin's direct PATCH is
 * refused rather than merely absent from the UI". So this asserts BOTH gates —
 *
 *   1. the route: `POST /:id/assign-subject-admin` 403s for a Subject Administrator, and
 *   2. the hook: the generic `PATCH /api/users/:id` carrying a `subjectAdmin` row 403s for the same
 *      caller, while their EDITING-ACCESS grant through the same generic route still succeeds.
 *
 * (2) is the one that matters. A guard that lives only on the new route leaves the old, still-open
 * door untouched — and the same caller's legitimate write succeeding in the same test is what proves
 * the guard is narrow rather than a blunt refusal of everything a Subject Admin does.
 *
 * HOW IT RUNS: like the rest of `tests/http` — a running app plus a seedable DB, MARK-tagged and
 * self-cleaning, over the real network at `E2E_BASE_URL`:
 *
 *   scripts/in-deps.sh --network lesson3_default --env-file .env \
 *     -e E2E_BASE_URL=http://app:3000 -- npm run test:http
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { MARK, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'
import { toId } from '../../src/access/index.js'

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

let fx: RoleFixture
const token: Record<string, string> = {}
/** A throwaway target, so nothing here depends on mutating a shared fixture account. */
let targetId = 0

const sgId = (): number => fx.subjectGrade.id

async function post(
  path: string,
  body: unknown,
  as?: RoleKey,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url(`/api/users/${path}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(as && token[as] ? { Authorization: `JWT ${token[as]}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  }
}

/**
 * Current `updatedAt`, so a freshness-guarded call can succeed.
 *
 * Read through the Local API, matching the sibling helper in `endpoints.http.spec.ts`. Reading it
 * over HTTP instead would put field access and serialization between the test and the value the 409
 * guard compares — two mechanisms that can disagree about the one token this whole endpoint family
 * is built around.
 */
async function freshUpdatedAt(id: number): Promise<string> {
  const doc = await fx.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
  return String(doc.updatedAt)
}

async function rolesOf(id: number): Promise<{ subjectGrade: number | undefined; role: string }[]> {
  const doc = await fx.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
  return (doc.assignments ?? []).map((a) => ({ subjectGrade: toId(a.subjectGrade), role: a.role }))
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens = await Promise.all(ROLES.map((k) => login(fx.users[k].email, fx.password)))
  ROLES.forEach((k, i) => (token[k] = tokens[i]!))

  const target = await fx.payload.create({
    collection: 'users',
    data: {
      name: `${MARK}assignTarget`,
      email: `${MARK.toLowerCase()}assign-target@example.com`,
      password: 'test1234',
      _verified: true,
    },
    overrideAccess: true,
  })
  targetId = target.id
})

afterAll(async () => {
  await fx.teardown()
})

describe('Subject Administrator appointment — the route gate (D6a)', () => {
  it('401 without authentication', async () => {
    const res = await post(`${targetId}/assign-subject-admin`, {
      subjectGradeId: sgId(),
      expectedUpdatedAt: new Date().toISOString(),
    })
    expect(res.status).toBe(401)
  })

  it('403 for a Teacher', async () => {
    const res = await post(
      `${targetId}/assign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: await freshUpdatedAt(targetId) },
      'teacher',
    )
    expect(res.status).toBe(403)
  })

  /**
   * ⚑ THE DECISION ITSELF. A Subject Administrator acting INSIDE their own subject-grade — the one
   * case the old code allowed, and the one D6a removes. Before this guard existed the call would have
   * succeeded and demoted the caller to editing access in the same write.
   */
  it('403 for a Subject Administrator, even within their own subject-grade', async () => {
    const res = await post(
      `${targetId}/assign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: await freshUpdatedAt(targetId) },
      'subjectAdmin',
    )
    expect(res.status).toBe(403)
    expect(await rolesOf(targetId)).toEqual([])
  })

  it('400 without a freshness token', async () => {
    const res = await post(
      `${targetId}/assign-subject-admin`,
      { subjectGradeId: sgId() },
      'siteAdmin',
    )
    expect(res.status).toBe(400)
  })

  it('409 on a stale freshness token', async () => {
    const res = await post(
      `${targetId}/assign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: new Date(0).toISOString() },
      'siteAdmin',
    )
    expect(res.status).toBe(409)
  })

  it('404 for an unknown user', async () => {
    const res = await post(
      `99999999/assign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: new Date().toISOString() },
      'siteAdmin',
    )
    expect(res.status).toBe(404)
  })
})

describe('Subject Administrator appointment — the happy paths', () => {
  it('appoints, and demotes the previous administrator to editing access', async () => {
    // The fixture's subjectAdmin currently holds the role for this subject-grade.
    expect(await rolesOf(fx.users.subjectAdmin.id)).toContainEqual({
      subjectGrade: sgId(),
      role: 'subjectAdmin',
    })

    const res = await post(
      `${targetId}/assign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: await freshUpdatedAt(targetId) },
      'siteAdmin',
    )
    expect(res.status).toBe(200)
    expect(await rolesOf(targetId)).toContainEqual({ subjectGrade: sgId(), role: 'subjectAdmin' })

    // ⚑ `autoDemotePriorSubjectAdmins` still fires — the ≤1 rule is NOT reimplemented in the
    // endpoint, so this asserts the existing hook is still reached through the new route.
    expect(await rolesOf(fx.users.subjectAdmin.id)).toContainEqual({
      subjectGrade: sgId(),
      role: 'editor',
    })
  })

  it('409 when the target already holds the role', async () => {
    const res = await post(
      `${targetId}/assign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: await freshUpdatedAt(targetId) },
      'siteAdmin',
    )
    expect(res.status).toBe(409)
  })

  /** Vacating leaves the subject-grade with NO administrator — deliberate (operator decision). */
  it('vacates the role, leaving the subject-grade with none', async () => {
    const res = await post(
      `${targetId}/unassign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: await freshUpdatedAt(targetId) },
      'siteAdmin',
    )
    expect(res.status).toBe(200)
    expect(await rolesOf(targetId)).toEqual([])
  })

  it('409 when vacating a role the target does not hold', async () => {
    const res = await post(
      `${targetId}/unassign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: await freshUpdatedAt(targetId) },
      'siteAdmin',
    )
    expect(res.status).toBe(409)
  })
})

/**
 * ⚑ THE OTHER DOOR — the generic `PATCH /api/users/:id`, which was already open and which a UI-only
 * guard would have left open.
 *
 * ⚑ THIS BLOCK OWNS ITS CALLER AND TARGET, and that is not tidiness. The first version reused
 * `fx.users.subjectAdmin` — after the happy-path test above appointed someone else and
 * `autoDemotePriorSubjectAdmins` demoted that very account to editing access. From then on the
 * "caller" was a Teacher, so the refusal arrived from COLLECTION ACCESS before the hook ran and the
 * test passed identically with the D6a guard deleted. A test whose subject is silently demoted by an
 * earlier test is worse than no test: `SPEC.md` and `docs/DECISIONS.md` both cite it as the proof.
 *
 * The branch-level cases now live in `tests/unit/enforceAssignmentScope.spec.ts`, where the hook is
 * called directly and no ordering can reach them. What is left here is the part only the wire can
 * show: that the refusal happens on a real HTTP request through the real stack.
 */
describe('Subject Administrator appointment — the generic PATCH door (D6a)', () => {
  let guardAdminToken = ''
  let guardTargetId = 0

  beforeAll(async () => {
    // A caller who genuinely administers this subject-grade AT THE TIME THESE RUN.
    const guardAdmin = await fx.payload.create({
      collection: 'users',
      data: {
        name: `${MARK}guardAdmin`,
        email: `${MARK.toLowerCase()}guard-admin@example.com`,
        password: 'test1234',
        _verified: true,
        assignments: [{ subjectGrade: sgId(), role: 'subjectAdmin' }],
      },
      overrideAccess: true,
    })
    guardAdminToken = await login(guardAdmin.email, 'test1234')

    const guardTarget = await fx.payload.create({
      collection: 'users',
      data: {
        name: `${MARK}guardTarget`,
        email: `${MARK.toLowerCase()}guard-target@example.com`,
        password: 'test1234',
        _verified: true,
      },
      overrideAccess: true,
    })
    guardTargetId = guardTarget.id
  })

  const patchAsGuardAdmin = async (data: unknown): Promise<number> => {
    const res = await fetch(url(`/api/users/${guardTargetId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${guardAdminToken}` },
      body: JSON.stringify(data),
    })
    return res.status
  }

  /**
   * ⚑ THE DISTINGUISHING PAIR, asserted in ONE test so ordering cannot decouple them. Same caller,
   * same target, same request shape — only the role differs. Refusing the `subjectAdmin` row proves
   * the guard exists; allowing the `editor` row in the same breath proves it is NARROW, which a
   * blunt "refuse every assignment write by a Subject Admin" would fail while passing the first half.
   */
  it('refuses a subjectAdmin row and allows an editor row, from the same caller', async () => {
    expect(
      await patchAsGuardAdmin({ assignments: [{ subjectGrade: sgId(), role: 'subjectAdmin' }] }),
    ).toBe(403)
    expect(await rolesOf(guardTargetId)).toEqual([])

    expect(
      await patchAsGuardAdmin({ assignments: [{ subjectGrade: sgId(), role: 'editor' }] }),
    ).toBe(200)
    expect(await rolesOf(guardTargetId)).toEqual([{ subjectGrade: sgId(), role: 'editor' }])
  })
})
