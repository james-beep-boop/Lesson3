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

export const lessonBundleVersionCreate: Access = ({ req: { user }, data }) => {
  const u = user as User | null | undefined
  if (isSiteAdmin(u)) return true
  const subjectGradeId = subjectGradeIdFor({ data })
  if (!subjectGradeId) return false
  return subjectGradeIdsByRole(u, ['editor', 'subjectAdmin']).includes(subjectGradeId)
}

// Working-copy model (Stage 2b): a Not-Official version is a mutable working copy; the Official
// version is immutable (enforced by `enforceVersionImmutable`, which can see the plan's pointer —
// access `Where` can't express "not this plan's official version"). Update is admin-scoped for now
// (Subject/Site Admin); Editor prose-editing follows once the field-split is factored out of
// `enforceBundleStructure`. Site Admin = all; Subject Admin = their subject-grades.
export const lessonBundleVersionUpdate: Access = ({ req: { user } }) => {
  const u = user as User | null | undefined
  if (isSiteAdmin(u)) return true
  const ids = subjectGradeIdsByRole(u, ['subjectAdmin'])
  return ids.length ? ({ subjectGrade: { in: ids } } satisfies Where) : false
}

export const lessonBundleVersionDelete: Access = ({ req: { user } }) => isSiteAdmin(user as User)
