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

// Stage 2 editing model: a saved version is an IMMUTABLE snapshot. The `update` access for
// lesson-bundle-versions is NOT here — it is one half of a two-part mechanism (a form-render-only
// grant paired with the beforeChange rejection) that lives, deliberately colocated, in
// `access/versionImmutability.ts` (`versionUpdateGrantForFormRenderOnly` + `enforceVersionImmutable`).
// Read that module's header before touching anything about version updates.

// Deletion scope (IA redesign 2026-07-01): Site Admin — anything; Subject Admin — any candidate in
// their subject-grades; Editor — ONLY candidates they personally authored (`author` = self, stamped by
// save-as-new) in their subject-grades. Versions predating authorship tracking have `author` = null and
// are therefore admin-only-deletable (decided: strict, no scope fallback). The Official version is never
// deletable — `enforceOfficialNotDeletable` (beforeDelete) blocks it regardless of this grant.
//
// Exported in Where form as the SINGLE SOURCE of the policy: the access function below and the Manage
// page's "deletable candidates" query (components/AdminDashboard) both use it, so the list a user sees
// on Manage can never drift from what the server lets them delete.
export const deletableVersionsWhere = (u: User | null | undefined): Where | boolean => {
  if (isSiteAdmin(u)) return true
  const adminIds = subjectGradeIdsByRole(u, ['subjectAdmin'])
  const editorIds = subjectGradeIdsByRole(u, ['editor'])
  const grants: Where[] = []
  if (adminIds.length) grants.push({ subjectGrade: { in: adminIds } })
  if (editorIds.length && u?.id != null) {
    grants.push({ and: [{ subjectGrade: { in: editorIds } }, { author: { equals: u.id } }] })
  }
  return grants.length ? ({ or: grants } satisfies Where) : false
}

export const lessonBundleVersionDelete: Access = ({ req: { user } }) =>
  deletableVersionsWhere(user as User | null | undefined)
