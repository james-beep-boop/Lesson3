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

// NO caller-access create path exists — a version only ever comes into being through a SYSTEM path
// (SPEC §7): ingest → 1.0.0, re-ingest → next major, edit+Save → next patch (the save-as-new
// endpoint). All three run `overrideAccess: true` and so bypass this gate entirely. A blank direct
// create has no legitimate place in the model and is actively harmful — `semver`/`author`/
// `sourceVersion` are systemOnly, so it lands as a provenance-less default 1.0.0 that trips the unique
// (lessonPlan, semver) index or corrupts version ordering (the class the 2026-07-06 semver audit,
// DECISIONS #65, had to harden). Denying it here also removes Payload's "Create New" / "Duplicate"
// document-controls actions, which those defaults gate on create permission (2026-07-18 edit-view
// cleanup — the kebab is replaced by an explicit Delete button in LessonControls).
export const lessonBundleVersionCreate: Access = () => false

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

/**
 * Per-DOCUMENT form of `deletableVersionsWhere` — the SAME policy evaluated against one version's
 * fields instead of as a query (Site Admin → any; Subject Admin → any in their sg; Editor → ONLY a
 * version they authored in their editor sg). The client (LessonControls) can't run a `Where`, so it
 * uses this to decide whether to OFFER Delete; keeping both forms here, adjacent, is what the
 * "never drift" invariant above requires. Authorship ALONE is not enough — a since-demoted author who
 * is no longer an Editor for the sg is refused, matching the server. The Official-not-deletable rule
 * is separate (`enforceOfficialNotDeletable`); callers gate on that too.
 */
export const canDeleteVersionDoc = (
  u: User | null | undefined,
  version: { subjectGrade?: unknown; author?: unknown },
): boolean => {
  const sgId = toId(version.subjectGrade as Assignment['subjectGrade'])
  // Site Admin (any sg) or Subject Admin of this sg → any candidate.
  if (isSubjectAdminFor(u, sgId)) return true
  // Editor of this sg → only a candidate they authored.
  return (
    sgId != null &&
    subjectGradeIdsByRole(u, ['editor']).includes(sgId) &&
    u?.id != null &&
    toId(version.author as Assignment['subjectGrade']) === u.id
  )
}
