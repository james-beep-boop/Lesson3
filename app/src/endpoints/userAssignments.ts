/**
 * Narrow role-assignment endpoints (Codex 2026-07-01 round-2 #2), mounted on `users`:
 *
 *   - POST /:id/assign-editor    — grant  the Editor role for ONE subject-grade
 *   - POST /:id/unassign-editor  — remove the Editor role for ONE subject-grade
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

import { json } from './respond'
import { toId, type Assignment } from '../access'
import type { User } from '../payload-types'

/** Parse + validate the shared body; throws 400s with actionable messages. */
async function parseBody(req: PayloadRequest): Promise<{ subjectGradeId: number; expectedUpdatedAt: string }> {
  const body = (typeof req.json === 'function' ? await req.json().catch(() => null) : null) as {
    subjectGradeId?: unknown
    expectedUpdatedAt?: unknown
  } | null
  const subjectGradeId = Number(body?.subjectGradeId)
  if (!Number.isFinite(subjectGradeId)) {
    throw new APIError('subjectGradeId is required.', 400)
  }
  const expectedUpdatedAt = body?.expectedUpdatedAt
  if (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new APIError('expectedUpdatedAt is required — reload before changing roles.', 400)
  }
  return { subjectGradeId, expectedUpdatedAt }
}

/** Shared handler: apply a one-row Editor grant/removal for `subjectGradeId` on user `:id`. */
function editorAssignmentEndpoint(mode: 'assign' | 'unassign'): Endpoint {
  return {
    path: `/:id/${mode}-editor`,
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      if (!req.user) throw new APIError('Unauthorized', 401)
      const id = req.routeParams?.id as string | undefined
      if (!id) throw new APIError('Missing user id', 400)
      const { subjectGradeId, expectedUpdatedAt } = await parseBody(req)

      const shouldCommit = await initTransaction(req)
      try {
        // Fresh read inside the transaction — the freshness check and the delta both work on it.
        const target = (await req.payload.findByID({
          collection: 'users',
          id,
          depth: 0,
          overrideAccess: true,
          req,
        })) as User
        if (Date.parse(String(target.updatedAt)) !== Date.parse(expectedUpdatedAt)) {
          throw new APIError(
            'This user’s roles changed since you loaded the page — reload before changing them.',
            409,
          )
        }

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
            throw new APIError('This user is not an Editor for that subject grade.', 409)
          }
          next = rows.filter((a) => !isEditorRowForSg(a))
        }

        // As the CALLER — all existing guards apply (collection/field access + scope hook + demote).
        const updated = (await req.payload.update({
          collection: 'users',
          id,
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
