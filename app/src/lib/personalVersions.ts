/**
 * "My saved versions" on Manage (Proposal B, operator decisions 2026-10-22,
 * `docs/PLAN-forum-dialogs-and-manage-personal-work-2026-10-22.md` §6.2) — every numbered version the
 * caller saved, with what they may still do to each.
 *
 * ⚑ OWNERSHIP, NOT DELETE AUTHORITY. Manage's cleanup list ("Delete individual versions") comes from
 * `deletableVersionsWhere`, which excludes Officials and answers "what may I delete". This answers
 * "what did I save", so it is its own query: a person's own Official versions are listed (decided), and
 * so are versions in subject-grades where they no longer have editing access.
 *
 * ⚑ THE `where` IS THE CALLER'S ID, from the session user the caller passes in. Authenticated users
 * can already read numbered versions; this predicate is what keeps the list personal. `author` is
 * stamped only by save-as-new, so uploaded ARES versions (no author) never appear — a Site
 * Administrator's list is their own edits, not the catalogue.
 *
 * ⚑ FLAGS ARE COMPUTED HERE, ON THE SERVER DOCUMENT, BEFORE ANYTHING IS PROJECTED for the client
 * (Codex review of the plan, P2). `canDeleteVersionDoc` grants a teacher with editing access only when
 * `version.author === user.id`, so a projection without `author` would have hidden Delete on every
 * teacher's own versions while administrators — who pass on subject-grade alone — masked the defect.
 * The row carries the decisions, never `author`.
 *
 * ⚑ FAILS CLOSED ON AN UNRESOLVED PLAN, as the cleanup list does: when the plan's Official pointer
 * cannot be read the row is still listed (it is the caller's work) but is `official: 'unknown'`, which
 * offers neither Delete nor Compare. Unknown must never become "not Official".
 *
 * Subject-grade LABELS are left to the caller, as `listUnsavedWork` does: Manage already resolves
 * subject-grades for its other rows.
 */
import type { PayloadRequest } from 'payload'

import { isEditorFor } from '../access'
import { canDeleteVersionDoc } from '../access/versioning'
import type { User } from '../payload-types'
import { distinctIds, relId } from './relId'
import { lessonDisplayName } from './substrand'

export interface PersonalVersionRow {
  id: number
  lessonPlanId: number | null
  label: string
  semver: string
  subjectGradeId: number | null
  /** ISO timestamp of the save, or null if the row has none. */
  createdAt: string | null
  /** Whether this version is its plan's Official one; `'unknown'` when the plan could not be read. */
  official: 'yes' | 'no' | 'unknown'
  /** The plan's Official version, the baseline for Compare to Official; null when there is none. */
  officialVersionId: number | null
  /** Delete would be accepted: not Official (known), and `canDeleteVersionDoc` holds. */
  canDelete: boolean
  /** Editing access for the version's subject-grade: Continue editing and the `?edit=1` link. */
  canEdit: boolean
}

export async function listPersonalVersions(
  req: PayloadRequest,
  user: User,
): Promise<PersonalVersionRow[]> {
  const { payload } = req
  const { docs: versions } = await payload.find({
    collection: 'lesson-bundle-versions',
    overrideAccess: false,
    user,
    req,
    depth: 0,
    pagination: false,
    sort: '-createdAt',
    where: { author: { equals: user.id } },
    select: {
      title: true,
      semver: true,
      subjectGrade: true,
      lessonPlan: true,
      author: true,
      meta: { substrand_name: true },
      createdAt: true,
    },
  })
  if (versions.length === 0) return []

  const planIds = distinctIds(versions.map((v) => relId(v.lessonPlan)))
  const { docs: plans } =
    planIds.length === 0
      ? { docs: [] }
      : await payload.find({
          collection: 'lesson-plans',
          overrideAccess: false,
          user,
          req,
          depth: 0,
          pagination: false,
          where: { id: { in: planIds } },
          select: { officialVersion: true },
        })
  // plan id → its Official version id, or null for a plan with no Official pointer.
  const officialByPlan = new Map<number, number | null>()
  for (const p of plans) officialByPlan.set(p.id, relId(p.officialVersion))

  return versions.map((v) => {
    const lessonPlanId = relId(v.lessonPlan)
    const subjectGradeId = relId(v.subjectGrade)
    const officialId = lessonPlanId == null ? undefined : officialByPlan.get(lessonPlanId)
    const official: PersonalVersionRow['official'] =
      officialId === undefined ? 'unknown' : officialId === v.id ? 'yes' : 'no'
    return {
      id: v.id,
      lessonPlanId,
      label: lessonDisplayName(v.meta?.substrand_name, v.title),
      semver: v.semver ?? '',
      subjectGradeId,
      createdAt: v.createdAt ?? null,
      official,
      officialVersionId: officialId ?? null,
      canDelete: official === 'no' && canDeleteVersionDoc(user, v),
      canEdit: isEditorFor(user, subjectGradeId ?? undefined),
    }
  })
}
