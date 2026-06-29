import type { Access, FieldAccess, Where } from 'payload'

import type { User } from '@/payload-types'
import { isSiteAdmin, isSubjectAdminFor, subjectGradeIdsByRole, toId } from './index'
import type { Assignment } from './index'

const subjectGradeFrom = (value: unknown): number | undefined =>
  toId(value as Assignment['subjectGrade'] | null | undefined)

const subjectGradeIdFor = (args: { data?: unknown; doc?: unknown }): number | undefined => {
  const data = args.data as { subjectGrade?: unknown } | undefined
  const doc = args.doc as { subjectGrade?: unknown } | undefined
  return subjectGradeFrom(data?.subjectGrade ?? doc?.subjectGrade)
}

export const lessonPlanRead: Access = ({ req: { user } }) => Boolean(user)

export const lessonPlanCreate: Access = ({ req: { user }, data }) => {
  const u = user as User | null | undefined
  if (isSiteAdmin(u)) return true
  return isSubjectAdminFor(u, subjectGradeIdFor({ data }))
}

export const lessonPlanUpdate: Access = ({ req: { user } }) => {
  const u = user as User | null | undefined
  if (isSiteAdmin(u)) return true
  const ids = subjectGradeIdsByRole(u, ['subjectAdmin'])
  return ids.length ? ({ subjectGrade: { in: ids } } satisfies Where) : false
}

export const lessonPlanDelete: Access = ({ req: { user } }) => isSiteAdmin(user as User)

export const canSetOfficialVersion: FieldAccess = ({ req: { user }, data, doc }) => {
  const u = user as User | null | undefined
  if (isSiteAdmin(u)) return true
  return isSubjectAdminFor(u, subjectGradeIdFor({ data, doc }))
}

export const lessonBundleVersionRead: Access = ({ req: { user } }) => Boolean(user)

// Creating a version row directly is an admin action. The Editor working-copy path does NOT create
// here — the fork endpoint copies the source via overrideAccess (a trusted faithful snapshot, not
// Editor-authored content), so Editors need no create access (which would let them set admin-only
// fields on a brand-new row, where the field-split has no original to protect). Ingest/migration use
// overrideAccess and are unaffected.
export const lessonBundleVersionCreate: Access = ({ req: { user }, data }) => {
  const u = user as User | null | undefined
  if (isSiteAdmin(u)) return true
  return isSubjectAdminFor(u, subjectGradeIdFor({ data }))
}

// Stage 2 editing model: a saved version is an IMMUTABLE candidate snapshot — there is no in-place
// edit. Authoring a change creates a NEW candidate via `POST /:id/save-as-new` (which writes with
// `overrideAccess`, applying the Editor/Admin field-split against the source). So NO authenticated user
// may update a version row in place; only trusted system paths (ingest, migrations, save-as-new) write,
// via `overrideAccess` (which bypasses this access function entirely). This is the server-side guarantee
// behind "edits never write back to an existing version" — not just the hidden native Save button.
export const lessonBundleVersionUpdate: Access = () => false

// Editors and Subject Admins may delete a NON-Official candidate in their subject-grades (e.g. the
// "delete the source you replaced" cleanup after save-as-new); Site Admin = all. The Official version is
// never deletable — `enforceOfficialNotDeletable` (beforeDelete) blocks it regardless of this grant.
export const lessonBundleVersionDelete: Access = ({ req: { user } }) => {
  const u = user as User | null | undefined
  if (isSiteAdmin(u)) return true
  const ids = subjectGradeIdsByRole(u, ['editor', 'subjectAdmin'])
  return ids.length ? ({ subjectGrade: { in: ids } } satisfies Where) : false
}
