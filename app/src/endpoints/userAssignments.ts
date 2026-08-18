/**
 * Narrow role-assignment endpoints (Codex 2026-07-01 round-2 #2), mounted on `users`:
 *
 *   - POST /:id/assign-editor    — grant  the teacher with editing access role for ONE subject-grade
 *   - POST /:id/unassign-editor  — remove the teacher with editing access role for ONE subject-grade
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
 * AUTHORIZATION is unchanged and stays with the existing machinery: the update runs with
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
import { json, readJsonBody, requireExpectedUpdatedAt, MAX_CONTROL_BODY_BYTES } from './respond'
import { toId, type Assignment } from '../access'
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

/** Shared handler: apply a one-row editing-access grant/removal for `subjectGradeId` on user `:id`. */
function editorAssignmentEndpoint(mode: 'assign' | 'unassign'): Endpoint {
  return {
    path: `/:id/${mode}-editor`,
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      if (!req.user) throw new APIError('Unauthorized', 401)
      const targetId = Number(req.routeParams?.id)
      if (!Number.isFinite(targetId)) throw new APIError('Missing user id', 400)
      const { subjectGradeId, expectedUpdatedAt } = await readAssignmentBody(req)

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
        const isEditorRowForSg = (a: Assignment) =>
          toId(a.subjectGrade) === subjectGradeId && a.role === 'editor'

        let next: Assignment[]
        if (mode === 'assign') {
          if (rows.some((a) => toId(a.subjectGrade) === subjectGradeId)) {
            throw new APIError('This user already has a role in that subject grade.', 409)
          }
          next = [...rows, { subjectGrade: subjectGradeId, role: 'editor' } as Assignment]
        } else {
          if (!rows.some(isEditorRowForSg)) {
            throw new APIError('This user does not have editing access for that subject grade.', 409)
          }
          next = rows.filter((a) => !isEditorRowForSg(a))
        }

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

export const assignEditorEndpoint = editorAssignmentEndpoint('assign')
export const unassignEditorEndpoint = editorAssignmentEndpoint('unassign')
