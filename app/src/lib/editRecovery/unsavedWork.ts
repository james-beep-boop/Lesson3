/**
 * "Your unsaved work" on Manage (SPEC §5, "Keep for later", 2026-10-17) — the caller's own captures,
 * resolved to rows a person can act on.
 *
 * Edit recovery already kept unsaved work on the server for 30 days, but the only way back to it was
 * remembering which version you had opened. This is the index: one row per capture, with where it
 * is, when it was last backed up and how long it will be kept.
 *
 * ⚑ THREE FILTERS, each matching a refusal the restore path would make anyway, so the list never
 * offers a row the editor would then turn away:
 *   1. holds unsaved work at all (`listOwnCaptures` — an Edit click with no typing is not work);
 *   2. the version is still readable by the caller (`overrideAccess: false`);
 *   3. the caller still has editing access for its subject-grade (`isEditorFor`) — the recovery
 *      endpoints 404 without it, so a teacher whose access was revoked cannot restore, and listing
 *      the row would promise something SPEC §5 says must not happen.
 *
 * Content is never read here. Whether a capture can still be applied (`restorable`) comes from
 * `captureProvenance`, the same predicate the GET endpoint uses, so the list and the restore prompt
 * agree. Subject-grade LABELS are left to the caller: Manage already resolves subject-grades for its
 * other rows, so this returns the id rather than spending a query on names it would fetch twice.
 *
 * Server-only: it imports the kernel, which imports the Postgres adapter.
 */
import type { PayloadRequest } from 'payload'

import { isEditorFor, isSiteAdmin, subjectGradeIdsByRole } from '../../access'
import type { User } from '../../payload-types'
import { relId } from '../relId'
import { lessonDisplayName } from '../substrand'
import { listOwnCaptures } from './kernel'
import { captureProvenance } from './provenance'

export interface UnsavedWorkRow {
  versionId: number
  label: string
  semver: string
  subjectGradeId: number | null
  /** ISO timestamp of the last confirmed backup — the row's own `updated_at`. */
  capturedAt: string
  /** False when the source moved or the field shape changed: the editor offers copy-out only. */
  restorable: boolean
  /** The precondition the existing discard endpoint requires. */
  token: { generation: number; revision: number }
}

export async function listUnsavedWork(req: PayloadRequest, user: User): Promise<UnsavedWorkRow[]> {
  // Filter 3, applied up front: someone with editing access nowhere can resume nothing, so a plain
  // Teacher's Manage render skips the query entirely.
  if (!isSiteAdmin(user) && subjectGradeIdsByRole(user, ['editor', 'subjectAdmin']).length === 0) {
    return []
  }
  const captures = await listOwnCaptures(req, { userId: user.id })
  if (captures.length === 0) return []

  const { docs: versions } = await req.payload.find({
    collection: 'lesson-bundle-versions',
    overrideAccess: false,
    user,
    req,
    depth: 0,
    pagination: false,
    where: { id: { in: captures.map((c) => c.sourceVersionId) } },
    select: {
      title: true,
      semver: true,
      subjectGrade: true,
      updatedAt: true,
      meta: { substrand_name: true },
    },
  })
  const byId = new Map(
    versions
      .filter((v) => isEditorFor(user, relId(v.subjectGrade) ?? undefined))
      .map((v) => [v.id, v]),
  )

  // Captures arrive newest first; keep that order rather than the find's.
  return captures.flatMap((c) => {
    const v = byId.get(c.sourceVersionId)
    if (!v) return []
    const { stale, schemaMismatch } = captureProvenance(c, v.updatedAt)
    return [
      {
        versionId: v.id,
        label: lessonDisplayName(v.meta?.substrand_name, v.title),
        semver: v.semver ?? '',
        subjectGradeId: relId(v.subjectGrade),
        capturedAt: c.token.updatedAt,
        restorable: !stale && !schemaMismatch,
        token: { generation: c.token.generation, revision: c.token.revision },
      },
    ]
  })
}
