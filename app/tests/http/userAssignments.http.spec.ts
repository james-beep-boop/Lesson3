/**
 * Wire-level authorization for the role-assignment endpoints (`endpoints/userAssignments.ts`).
 *
 * ⚑ THE D6a GUARD IS THE POINT OF THIS FILE, and the rule it guards is ASYMMETRIC as of the
 * 2026-08-19 amendment. The design doc is blunt that hiding the picker is not the fix: "a wire-level
 * test proving a Subject Admin's direct PATCH is refused rather than merely absent from the UI". So
 * this asserts both gates, in both directions —
 *
 *   1. the route: `POST /:id/unassign-subject-admin` 403s for a Subject Administrator before the body
 *      is even read, while `assign-subject-admin` succeeds for one handing over to an existing editor;
 *   2. the hook: the generic `PATCH /api/users/:id` refuses the same caller REMOVING a `subjectAdmin`
 *      row (including their own) and refuses ADDING one for somebody with no editing access there,
 *      while permitting the appointment of an existing editor and their ordinary editing-access grants.
 *
 * (2) is the one that matters. A guard that lives only on the new routes leaves the old, still-open
 * door untouched — and the same caller's legitimate writes succeeding in the same tests are what prove
 * the guard is narrow rather than a blunt refusal of everything a Subject Admin does.
 *
 * ⚑ WHY EVERY REFUSAL HERE NAMES ITS REASON. Before the amendment, "a Subject Admin may not write a
 * `subjectAdmin` row" was one rule and any 403 confirmed it. Now there are two independent reasons a
 * request is refused — the actor's authority, and the TARGET's eligibility — so a test whose target
 * happens to hold no editing access proves only the second while reading as though it proved the
 * first. Two tests in this file did exactly that until 2026-08-20; both now say which rule they are on.
 *
 * HOW IT RUNS: like the rest of `tests/http` — a running app plus a seedable DB, MARK-tagged and
 * self-cleaning, over the real network at `E2E_BASE_URL`:
 *
 *   scripts/in-deps.sh --network lesson3_default --env-file .env \
 *     -e E2E_BASE_URL=http://app:3000 -- npm run test:http
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  MARK,
  createUserVerified,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'
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
  // A fixture ROLE, or a minted account's own token — the handover cases need callers the fixture
  // does not have, and a second near-identical `fetch` in this file is how the two shapes drift.
  as?: RoleKey | { jwt: string },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const jwt = typeof as === 'object' ? as.jwt : as ? token[as] : undefined
  const res = await fetch(url(`/api/users/${path}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `JWT ${jwt}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  }
}

/** The generic door: `PATCH /api/users/:id` as whoever holds `jwt`. */
async function patch(id: number, data: unknown, jwt: string): Promise<number> {
  const res = await fetch(url(`/api/users/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${jwt}` },
    body: JSON.stringify(data),
  })
  return res.status
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
   * ⚑ REFRAMED 2026-08-20, BECAUSE IT NOW PASSES FOR A DIFFERENT REASON THAN ITS NAME CLAIMED. It
   * used to read "403 for a Subject Administrator, even within their own subject-grade" and describe
   * itself as "THE DECISION ITSELF… the one case D6a removes". The amendment permits exactly that
   * case — a Subject Administrator appointing INSIDE their own subject-grade is a handover — so the
   * old framing now states the opposite of the rule while the assertion still passes.
   *
   * What it actually proves is the TARGET-eligibility half: `targetId` holds no editing access here,
   * so the appointment is refused however legitimate the caller's authority. The caller's authority is
   * a separate rule with its own tests below, and keeping the two apart is the point — a 403 alone no
   * longer identifies which one fired.
   */
  it('403 appointing somebody who holds no editing access in that subject-grade', async () => {
    const res = await post(
      `${targetId}/assign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: await freshUpdatedAt(targetId) },
      'subjectAdmin',
    )
    expect(res.status).toBe(403)
    expect(await rolesOf(targetId)).toEqual([])
  })

  /**
   * ⚑ THE ROUTE GATE FIRES BEFORE THE BODY IS READ — a claim the handler's own comment makes and
   * nothing asserted. Vacating is Site-Admin-only, so the same empty body that a Site Administrator
   * gets a 400 for is a 403 for a Subject Administrator: the gate answered before `readAssignmentBody`
   * ever ran. The pair is one test because the 403 alone is equally consistent with the gate running
   * AFTER the parse, and the ordering is the whole reason a Subject Administrator meets an honest 403
   * on the route they used rather than a confusing failure deeper in the stack.
   */
  it('403s a Subject Administrator vacating ahead of the body parse a Site Admin reaches', async () => {
    expect(await post(`${targetId}/unassign-subject-admin`, {}, 'subjectAdmin')).toMatchObject({
      status: 403,
    })
    expect(await post(`${targetId}/unassign-subject-admin`, {}, 'siteAdmin')).toMatchObject({
      status: 400,
    })
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
  let guardAdminId = 0
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
    guardAdminId = guardAdmin.id
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

  const patchAsGuardAdmin = (data: unknown): Promise<number> =>
    patch(guardTargetId, data, guardAdminToken)

  /**
   * ⚑ THE DISTINGUISHING SEQUENCE, asserted in ONE test so ordering cannot decouple its steps. Same
   * caller, same target, same request shape throughout — the only thing that changes is what the
   * TARGET already holds.
   *
   * ⚑ THE THIRD STEP IS WHAT MAKES THE FIRST MEAN ANYTHING (added 2026-08-20). As a pair, steps 1–2
   * were consistent with the pre-amendment rule ("a Subject Admin may not write a `subjectAdmin` row
   * at all") AND with the amended one ("…not for a target with no editing access here"), and its
   * docblock asserted the former — which the amendment made false while every assertion kept passing.
   * Replaying the IDENTICAL refused request after step 2 has granted editing access, and getting a
   * 200, is what pins which rule the 403 was: nothing about the caller's authority changed between
   * them.
   *
   * Step 2 is still doing its original job — allowing the `editor` row proves the guard is NARROW,
   * where a blunt "refuse every assignment write by a Subject Admin" would pass step 1 and fail here.
   */
  it('refuses, then permits, the SAME appointment as the target gains editing access', async () => {
    const appointment = { assignments: [{ subjectGrade: sgId(), role: 'subjectAdmin' }] }

    // 1. Ineligible target: refused on the TARGET rule, not the caller's authority.
    expect(await patchAsGuardAdmin(appointment)).toBe(403)
    expect(await rolesOf(guardTargetId)).toEqual([])

    // 2. The same caller's ordinary grant, through the same door.
    expect(
      await patchAsGuardAdmin({ assignments: [{ subjectGrade: sgId(), role: 'editor' }] }),
    ).toBe(200)
    expect(await rolesOf(guardTargetId)).toEqual([{ subjectGrade: sgId(), role: 'editor' }])

    // 3. Byte-identical to step 1, and now permitted — the handover the amendment added.
    expect(await patchAsGuardAdmin(appointment)).toBe(200)
    expect(await rolesOf(guardTargetId)).toEqual([{ subjectGrade: sgId(), role: 'subjectAdmin' }])

    // ⚑ AND THE CALLER PAID FOR IT. `autoDemotePriorSubjectAdmins` runs on this path too, so the
    // administrator who performed the handover is now an editor — the self-demotion the panel's
    // confirmation warns about, observed through the generic door rather than the endpoint.
    expect(await rolesOf(guardAdminId)).toEqual([{ subjectGrade: sgId(), role: 'editor' }])
  })
})

/**
 * ⚑ THE AMENDED HALF AT THE WIRE (D6a, operator decision 2026-08-19): a Subject Administrator may
 * HAND administration over, and may not TAKE it away. The blocks above cover the refusals and the
 * generic door; what is left is the permitted route call and the one removal a person is most likely
 * to attempt on themselves.
 *
 * ⚑ EVERY CASE MINTS ITS OWN ADMINISTRATOR, INSIDE THE TEST — not in a `beforeAll`, and not shared.
 * Two independent reasons, both learned in this file:
 *
 *   1. A SUCCESSFUL HANDOVER DEMOTES THE CALLER. That is the rule, not a side effect, so a shared
 *      administrator is a Teacher by the second test and every later refusal arrives from COLLECTION
 *      ACCESS before the hook runs — the exact defect recorded above ("the test passed identically
 *      with the D6a guard deleted"), reproduced by the feature itself rather than by a fixture slip.
 *   2. `autoDemotePriorSubjectAdmins` enforces ≤1 per subject-grade, so minting a second
 *      administrator in a `beforeAll` would demote the first before its test ever ran.
 */
describe('Subject Administrator handover — the amended rule at the wire (D6a)', () => {
  let n = 0
  /**
   * A fresh account holding `role` for the fixture's subject-grade, plus a token for it.
   *
   * Through `createUserVerified`, which owns `disableVerificationEmail` — the older creates in this
   * file predate the helper and print "Email attempted without being configured" on every run.
   */
  const mint = async (role: 'subjectAdmin' | 'editor') => {
    const slug = `handover${(n += 1)}`
    const user = await createUserVerified(fx.payload, {
      name: `${MARK}${slug}`,
      email: `${MARK.toLowerCase()}${slug}@example.com`,
      password: 'test1234',
      assignments: [{ subjectGrade: sgId(), role }],
    })
    return { id: user.id, jwt: await login(String(user.email), 'test1234') }
  }

  it('PERMITS the route handover to an existing editor, and demotes the outgoing administrator', async () => {
    // Order matters: the successor is created FIRST, because minting the administrator fires the ≤1
    // cascade and creating an editor does not.
    const successor = await mint('editor')
    const outgoing = await mint('subjectAdmin')

    const handover = await post(
      `${successor.id}/assign-subject-admin`,
      { subjectGradeId: sgId(), expectedUpdatedAt: await freshUpdatedAt(successor.id) },
      { jwt: outgoing.jwt },
    )
    expect(handover.status).toBe(200)
    expect(await rolesOf(successor.id)).toEqual([{ subjectGrade: sgId(), role: 'subjectAdmin' }])

    // ⚑ THE CONSEQUENCE THE CONFIRMATION PROMISES. The outgoing administrator holds editing access
    // and nothing more, so the Roles & Access panel is gone from their next request — which is why
    // `RolesAccessPanel`'s handover dialog says so before the click.
    expect(await rolesOf(outgoing.id)).toEqual([{ subjectGrade: sgId(), role: 'editor' }])
  })

  /**
   * ⚑ NOBODY MAY RESIGN. The removal half is Site-Admin-only whoever the row belongs to, and the
   * self-case is the one a real administrator would try — the routes refuse it before reading a body
   * (above), so this is the generic door.
   *
   * The no-op write first is what stops this passing for the wrong reason: if self-writes of
   * `assignments` were refused by collection or field access, the second call would 403 with the D6a
   * guard deleted. A 200 on the identical path with the identical rows isolates the refusal to the
   * removal rule.
   */
  it('REFUSES an administrator deleting their own subjectAdmin row, though the path is open', async () => {
    const admin = await mint('subjectAdmin')
    const rows = [{ subjectGrade: sgId(), role: 'subjectAdmin' }]

    expect(await patch(admin.id, { assignments: rows }, admin.jwt)).toBe(200)
    expect(await patch(admin.id, { assignments: [] }, admin.jwt)).toBe(403)
    expect(await rolesOf(admin.id)).toEqual([{ subjectGrade: sgId(), role: 'subjectAdmin' }])
  })
})
