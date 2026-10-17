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
 * Content is never read here. Whether a capture can still be applied (`restorable`) is computed from
 * the same two facts the GET endpoint compares, so the list and the restore prompt agree.
 *
 * Server-only: it imports the kernel, which imports the Postgres adapter.
 */
import type { PayloadRequest } from 'payload'

import { isEditorFor } from '../../access'
import { CAPTURE_SCHEMA_VERSION } from '../../endpoints/recovery'
import type { User } from '../../payload-types'
import { distinctIds, relId } from '../relId'
import { lessonDisplayName } from '../substrand'
import { listOwnCaptures } from './kernel'
import { captureKeptUntil } from './ttl'

export interface UnsavedWorkRow {
  versionId: number
  label: string
  semver: string
  sgLabel: string
  /** ISO timestamp of the last confirmed backup — the row's own `updated_at`. */
  capturedAt: string
  /** ISO timestamp: guaranteed kept until at least this moment (`captureKeptUntil`). */
  keptUntil: string
  /** False when the source moved or the field shape changed: the editor offers copy-out only. */
  restorable: boolean
  /** The precondition the existing discard endpoint requires. */
  token: { generation: number; revision: number }
}

export async function listUnsavedWork(req: PayloadRequest, user: User): Promise<UnsavedWorkRow[]> {
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
  const editable = versions.filter((v) => isEditorFor(user, relId(v.subjectGrade) ?? undefined))
  if (editable.length === 0) return []

  const sgIds = distinctIds(editable.map((v) => relId(v.subjectGrade)))
  const { docs: grades } = await req.payload.find({
    collection: 'subject-grades',
    overrideAccess: false,
    user,
    req,
    depth: 0,
    pagination: false,
    where: { id: { in: sgIds } },
    select: { displayName: true },
  })
  const sgLabel = new Map(grades.map((g) => [g.id, g.displayName ?? '']))
  const byId = new Map(editable.map((v) => [v.id, v]))

  // Captures arrive newest first; keep that order rather than the find's.
  return captures.flatMap((c) => {
    const v = byId.get(c.sourceVersionId)
    if (!v) return []
    const sgId = relId(v.subjectGrade)
    return [
      {
        versionId: v.id,
        label: lessonDisplayName(v.meta?.substrand_name, v.title),
        semver: v.semver ?? '',
        sgLabel: (sgId != null ? sgLabel.get(sgId) : undefined) ?? '',
        capturedAt: c.token.updatedAt,
        keptUntil: captureKeptUntil(c.token.updatedAt).toISOString(),
        restorable:
          c.schemaVersion === CAPTURE_SCHEMA_VERSION &&
          c.baseUpdatedAt === new Date(String(v.updatedAt)).toISOString(),
        token: { generation: c.token.generation, revision: c.token.revision },
      },
    ]
  })
}
