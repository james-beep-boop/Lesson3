/**
 * Narrow role-assignment endpoints (Codex 2026-07-01 round-2 #2), mounted on `users`:
 *
 *   - POST /:id/assign-editor          — grant  editing access for ONE subject-grade
 *   - POST /:id/unassign-editor        — remove editing access for ONE subject-grade
 *   - POST /:id/assign-subject-admin   — appoint the Subject Administrator of ONE subject-grade
 *   - POST /:id/unassign-subject-admin — vacate that role, leaving the subject-grade with none
 *
 * Body (JSON): { subjectGradeId: number, expectedUpdatedAt: string }.
 *
 * WHY these exist instead of the generic PATCH the Editors widget used to send: a full-`assignments`
 * PATCH built from page-render state silently overwrites any role change another admin made since the
 * page loaded — lost updates on AUTHORIZATION data. These endpoints eliminate that class:
 *
 *   1. `expectedUpdatedAt` is REQUIRED (400 absent) and checked against the user's current
 *      `updatedAt` INSIDE the transaction (409 stale) — consent names the state it was about,
 *      same principle as make-official's expectedPreviousOfficialId.
 *   2. The server rebuilds `assignments` from the FRESH row and applies a ONE-ROW delta — it never
 *      writes back a client-supplied array, so even a sub-millisecond race can only reorder two
 *      single-row deltas, never restore a stale snapshot.
 *
 * ⚑ THE ROLE IS BAKED INTO THE ENDPOINT, NOT READ FROM THE BODY. The factory below is parameterised
 * over the role at MODULE level, so `assign-editor` and `assign-subject-admin` are two distinct
 * routes with two distinct authorization postures. A single role-carrying endpoint would have put
 * "which role am I granting" into a request body on a route that Subject Administrators may
 * legitimately call — one validation slip from exactly what D6a forbids. The duplication this avoids
 * (locking, freshness, transaction handling) is shared; the part that must not be shared is not.
 *
 * ⚑ SUBJECT-ADMINISTRATOR ROUTES ARE ASYMMETRIC (D6a, operator decision 2026-08-16, AMENDED
 * 2026-08-19 — this paragraph said "SITE-ADMIN-ONLY" until then, and the amendment left it stating the
 * opposite of the code below it). `unassign-subject-admin` is Site-Admin-only and refuses before the
 * body is read. `assign-subject-admin` is a HANDOVER, which a Subject Administrator of that
 * subject-grade may perform, so this file asks only whether the caller administers it; the full rule —
 * the target must already hold editing access there — belongs to `enforceAssignmentScope`, which every
 * write path passes through, including the generic PATCH that bypasses these routes entirely. Two
 * gates on purpose: the route gives an honest 403 on the route the caller used, the hook is the
 * authority.
 *
 * AUTHORIZATION is otherwise unchanged and stays with the existing machinery: the update runs with
 * `overrideAccess: false` as the caller, so `usersCollectionUpdate` + `assignmentsUpdateField` gate
 * the write and `enforceAssignmentScope` rejects rows outside the caller's subject-grades;
 * `autoDemotePriorSubjectAdmins` still fires. The endpoints add freshness, not new power.
 */
import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type Endpoint,
  type PayloadRequest,
} from 'payload'

import { lockAndVerifyFresh } from '../lib/txDb'
import { takeAdminCountLock } from '../hooks/userRoles'
import {
  assertSiteAdmin,
  json,
  readJsonBody,
  requireExpectedUpdatedAt,
  MAX_CONTROL_BODY_BYTES,
} from './respond'
import { isSubjectAdminFor, toId, type Assignment } from '../access'
import { assignmentAction, type AssignmentRole } from '../lib/assignmentRoles'
import type { User } from '../payload-types'

/**
 * Parse + validate the shared body; throws 400s with actionable messages, and a 413 for an honestly
 * declared oversized one.
 *
 * ⚑ THE CEILING MATTERS MORE HERE THAN THE MESSAGES DO. This endpoint reads its body BEFORE it has
 * authorized anything beyond "you are signed in" — the scope check lives in `enforceAssignmentScope`,
 * which does not run until the update below — and it declares no rate bucket. Until 2026-08-16 that
 * made it the cheapest unbounded allocation any authenticated Teacher could ask this process for.
 *
 * Exported for `tests/unit/jsonBodyCeiling.spec.ts`: the guard is unit-testable only if the read is
 * reachable without a database, which is the same split `readMarkReadIds` and `readRecoveryBody` use.
 */
export async function readAssignmentBody(
  req: PayloadRequest,
): Promise<{ subjectGradeId: number; expectedUpdatedAt: string }> {
  const body = await readJsonBody<{ subjectGradeId?: unknown; expectedUpdatedAt?: unknown }>(
    req,
    MAX_CONTROL_BODY_BYTES,
  )
  const subjectGradeId = Number(body?.subjectGradeId)
  if (!Number.isFinite(subjectGradeId)) {
    throw new APIError('subjectGradeId is required.', 400)
  }
  return {
    subjectGradeId,
    expectedUpdatedAt: requireExpectedUpdatedAt(
      body?.expectedUpdatedAt,
      'expectedUpdatedAt is required — reload before changing roles.',
    ),
  }
}

/** The assignment roles these endpoints grant, and the route slug each one uses. */
const ROLE_RULES = {
  editor: {
    unassignSiteAdminOnly: false,
    already: 'This user already has editing access for that subject grade.',
    missing: 'This user does not have editing access for that subject grade.',
  },
  subjectAdmin: {
    // ⚑ D6a AMENDED 2026-08-19: the flag is NAMED for the half it gates, because this is now
    // asymmetric and `siteAdminOnly` — what it used to be called — read as the whole posture while
    // gating half of it. Vacating an administrator stays Site-Admin-only and is knowable before the
    // body is read. APPOINTING is a handover, permitted to a Subject Administrator of that
    // subject-grade, and it deliberately does NOT live in this table: eligibility depends on
    // `subjectGradeId`, which is not known where the table is read, so it is checked once the body has
    // been parsed (below) and enforced fully by `enforceAssignmentScope`.
    unassignSiteAdminOnly: true,
    already: 'This user is already the Subject Administrator of that subject grade.',
    missing: 'This user is not the Subject Administrator of that subject grade.',
  },
} as const satisfies Record<
  AssignmentRole,
  { unassignSiteAdminOnly: boolean; already: string; missing: string }
>
type GrantableRole = AssignmentRole

/**
 * The one-row delta, as a pure function — the only place the two roles genuinely diverge.
 *
 * `assign` differs because an existing row for this subject-grade means different things:
 *   - editing access is REFUSED when any other role is held here; silently demoting an administrator
 *     by granting them the gentler-sounding capability is not a side effect worth having.
 *   - an appointment REPLACES whatever was held, because promoting the subject-grade's existing
 *     editor is the common case. The other half of ≤1 — demoting the PREVIOUS administrator — is
 *     `autoDemotePriorSubjectAdmins`, deliberately not reimplemented here.
 */
export function nextRows(
  mode: 'assign' | 'unassign',
  role: GrantableRole,
  rows: Assignment[],
  subjectGradeId: number,
): Assignment[] {
  const isThisRole = (a: Assignment) => toId(a.subjectGrade) === subjectGradeId && a.role === role
  const inThisSubjectGrade = (a: Assignment) => toId(a.subjectGrade) === subjectGradeId

  if (mode === 'unassign') {
    if (!rows.some(isThisRole)) throw new APIError(ROLE_RULES[role].missing, 409)
    // ⚑ Vacating leaves the subject-grade with NO administrator, deliberately (operator decision):
    // offboarding must not require appointing a replacement first.
    return rows.filter((a) => !isThisRole(a))
  }
  if (rows.some(isThisRole)) throw new APIError(ROLE_RULES[role].already, 409)
  if (role === 'editor') {
    if (rows.some(inThisSubjectGrade)) {
      throw new APIError('This user already has a role in that subject grade.', 409)
    }
    return [...rows, { subjectGrade: subjectGradeId, role } as Assignment]
  }
  return [
    ...rows.filter((a) => !inThisSubjectGrade(a)),
    { subjectGrade: subjectGradeId, role } as Assignment,
  ]
}

/**
 * Shared handler: apply a one-row grant/removal of `role` for `subjectGradeId` on user `:id`.
 *
 * ⚑ THE PER-ROLE DIFFERENCES LIVE IN `ROLE_RULES` AND `nextRows`, not scattered through the handler.
 * An earlier version of this docblock claimed the roles "differ in exactly one place… `nextRows`
 * below" while no such function existed and the divergence was spread across four branches. The
 * shared body — auth, body parse, transaction, lock, freshness, update, commit — is what the factory
 * is for; `nextRows` is a pure function of (mode, role, rows, subjectGradeId), so the part that
 * actually differs is testable without a database.
 */
function assignmentEndpoint(mode: 'assign' | 'unassign', role: GrantableRole): Endpoint {
  return {
    path: `/:id/${assignmentAction(mode, role)}`,
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      if (!req.user) throw new APIError('Unauthorized', 401)
      // ⚑ D6a, AMENDED 2026-08-19. VACATING an administrator remains Site-Admin-only and is refused
      // before the body is even read — a Subject Administrator calling it gets a 403 on the route they
      // used rather than a confusing failure deeper in the stack.
      //
      // APPOINTING is now a handover a Subject Administrator may perform, so it cannot be settled here:
      // eligibility depends on the subject-grade in the body. It is gated just below, and the full rule
      // (the target must already hold editing access there) belongs to `enforceAssignmentScope`, which
      // every write path passes through. Two gates, as before — this one coarse and honest, the hook
      // precise.
      if (ROLE_RULES[role].unassignSiteAdminOnly && mode === 'unassign') assertSiteAdmin(req)
      const targetId = Number(req.routeParams?.id)
      if (!Number.isFinite(targetId)) throw new APIError('Missing user id', 400)
      const { subjectGradeId, expectedUpdatedAt } = await readAssignmentBody(req)

      // The appointment half of the amended rule, now that `subjectGradeId` is known: a Site
      // Administrator, or an administrator OF THIS subject-grade handing it over. Deliberately coarser
      // than the hook — it does not re-derive "the target already has editing access here", because two
      // copies of one authorization rule is how they drift. The hook is the authority; this exists so a
      // caller with no business here is turned away with a 403 on the route they called, rather than
      // reaching the lock and freshness check and being told 409 that their consent token is stale.
      //
      // ⚑ ONE PREDICATE, NOT TWO. `isSubjectAdminFor` is itself "a Site Administrator, OR holds a
      // `subjectAdmin` row here" (`src/access/index.ts`), so the outer `!isSiteAdmin(...)` this had
      // until 2026-08-20 restated half of the helper's own rule and could not change the outcome —
      // exactly the drift the sentence above warns about, committed three lines below it.
      if (role === 'subjectAdmin' && mode === 'assign') {
        if (!isSubjectAdminFor(req.user as User, subjectGradeId)) {
          throw new APIError('Forbidden', 403)
        }
      }

      const shouldCommit = await initTransaction(req)
      try {
        // Serialize concurrent role changes on this user, then refuse a stale consent token.
        //
        // ⚑ THIS LOCK IS LOAD-BEARING, unlike make-official's, which DECISIONS 2026-08-14 removed
        // on the grounds that a stale-consent check plus rollback already covered every ordering.
        // The docblock above likens `expectedUpdatedAt` to `expectedPreviousOfficialId`, so the same
        // argument looks like it should apply here — it does not. There the consent value decides
        // only whether to proceed. Here the check is a READ-then-COMPARE followed by a SEPARATE
        // unconditional write of the whole assignments array, so two requests can both pass the
        // compare before either writes and the later one silently drops the earlier delta. Do not
        // delete this by analogy.
        //
        // ⚑ GLOBAL KEY FIRST, as ordering insurance. This file row-locks `users` and then updates
        // them, and a generic PATCH reaches `ADMIN_COUNT_LOCK` in its hooks BEFORE its DML takes the
        // row — so taking the row first here would invert the pair and deadlock a same-user race.
        //
        // ⚑ Today this endpoint's writes touch `assignments` only, so `guardLastSiteAdmin` never
        // actually takes the key on this path and the lock is precautionary. An earlier version of
        // this comment claimed it "makes GRANTS participate in the shared key" — it does not: these
        // are EDITOR assignments, and the site-admin grant case is handled in the guard itself. The
        // cost of keeping it is serialising editor grants against each other, which are single
        // administrator actions; the benefit is that a future change to what the guard covers cannot
        // silently invert this pair.
        await takeAdminCountLock(req)
        const target = await lockAndVerifyFresh<User>(
          req,
          'users',
          targetId,
          expectedUpdatedAt,
          'This user’s roles changed since you loaded the page — reload before changing them.',
        )

        const rows: Assignment[] = (target.assignments ?? []) as Assignment[]
        const next = nextRows(mode, role, rows, subjectGradeId)

        // As the CALLER — all existing guards apply (collection/field access + scope hook + demote,
        // including the site-admin-target rule in `enforceAssignmentScope`).
        const updated = (await req.payload.update({
          collection: 'users',
          id: targetId,
          data: { assignments: next } as never,
          overrideAccess: false,
          user: req.user,
          req,
        })) as User

        if (shouldCommit) await commitTransaction(req)
        return json({ ok: true, updatedAt: updated.updatedAt })
      } catch (e) {
        await killTransaction(req)
        throw e
      }
    },
  }
}

export const assignEditorEndpoint = assignmentEndpoint('assign', 'editor')
export const unassignEditorEndpoint = assignmentEndpoint('unassign', 'editor')
export const assignSubjectAdminEndpoint = assignmentEndpoint('assign', 'subjectAdmin')
export const unassignSubjectAdminEndpoint = assignmentEndpoint('unassign', 'subjectAdmin')
