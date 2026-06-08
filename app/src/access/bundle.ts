import type { Access, FieldAccess } from 'payload'

import type { User } from '@/payload-types'
import { isEditorFor, isSiteAdmin, isSubjectAdminFor, toId } from './index'

/**
 * Access for LessonBundles (SPEC §5, §8).
 *
 * Collection: Teachers (any authenticated) read/export *any* bundle; Editors and
 * Subject Admins may update bundles within their subject-grades; Subject Admins
 * create/delete within theirs; Site Admins everything.
 *
 * Field-level (SPEC §5): Editors edit prose values; Subject Admins additionally edit
 * META / aresKeywords / phase / duration / structure / answer keys; the resource
 * column and lesson numbers are system-only.
 */

type Assignment = NonNullable<User['assignments']>[number]

const collectSubjectGradeIds = (
  user: User | null | undefined,
  roles: Assignment['role'][],
): number[] => {
  if (!user?.assignments) return []
  const ids = user.assignments
    .filter((a) => roles.includes(a.role))
    .map((a) => toId(a.subjectGrade))
    .filter((id): id is number => id != null)
  return [...new Set(ids)]
}

export const editableSubjectGradeIds = (user: User | null | undefined): number[] =>
  collectSubjectGradeIds(user, ['editor', 'subjectAdmin'])

export const adminSubjectGradeIds = (user: User | null | undefined): number[] =>
  collectSubjectGradeIds(user, ['subjectAdmin'])

// The subject-grade this field's document belongs to: existing doc on update,
// incoming data on create.
const subjectGradeIdFor = (args: { doc?: unknown; data?: unknown }): number | undefined => {
  const doc = args.doc as { subjectGrade?: Assignment['subjectGrade'] } | undefined
  const data = args.data as { subjectGrade?: Assignment['subjectGrade'] } | undefined
  return toId(doc?.subjectGrade ?? data?.subjectGrade)
}

// ----- collection-level -----

export const lessonBundleRead: Access = ({ req: { user } }) => Boolean(user)

export const lessonBundleCreate: Access = ({ req: { user }, data }) =>
  isSubjectAdminFor(user as User, toId((data as { subjectGrade?: Assignment['subjectGrade'] })?.subjectGrade))

export const lessonBundleUpdate: Access = ({ req: { user } }) => {
  const u = user as User
  if (isSiteAdmin(u)) return true
  const ids = editableSubjectGradeIds(u)
  return ids.length ? { subjectGrade: { in: ids } } : false
}

export const lessonBundleDelete: Access = ({ req: { user } }) => {
  const u = user as User
  if (isSiteAdmin(u)) return true
  const ids = adminSubjectGradeIds(u)
  return ids.length ? { subjectGrade: { in: ids } } : false
}

// ----- field-level -----

/** Editors (and above) may set this field's value. */
export const canEditProse: FieldAccess = ({ req: { user }, doc, data }) =>
  isEditorFor(user as User, subjectGradeIdFor({ doc, data }))

/** Subject Admins (and Site Admins) only — META, phase, duration, answer keys, structure. */
export const canEditStructure: FieldAccess = ({ req: { user }, doc, data }) =>
  isSubjectAdminFor(user as User, subjectGradeIdFor({ doc, data }))

/** System-only: the resource column and lesson numbers are never user-editable; they
 *  are set by ingest/order via the structural hook (which runs after field access). */
export const systemOnly: FieldAccess = () => false
