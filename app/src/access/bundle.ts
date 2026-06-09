import type { Access, FieldAccess, Where } from 'payload'

import type { User } from '@/payload-types'
import type { Assignment } from './index'
import {
  isEditorFor,
  isSiteAdmin,
  isSubjectAdminFor,
  subjectGradeIdsByRole,
  toId,
} from './index'

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

export const editableSubjectGradeIds = (user: User | null | undefined): number[] =>
  subjectGradeIdsByRole(user, ['editor', 'subjectAdmin'])

export const adminSubjectGradeIds = (user: User | null | undefined): number[] =>
  subjectGradeIdsByRole(user, ['subjectAdmin'])

// The subject-grade this field's document belongs to: existing doc on update,
// incoming data on create.
const subjectGradeIdFor = (args: { doc?: unknown; data?: unknown }): number | undefined => {
  const doc = args.doc as { subjectGrade?: Assignment['subjectGrade'] } | undefined
  const data = args.data as { subjectGrade?: Assignment['subjectGrade'] } | undefined
  return toId(doc?.subjectGrade ?? data?.subjectGrade)
}

// ----- collection-level -----

/**
 * Read boundary (SPEC §6/§8). Teachers (any authenticated user with no grant) may read
 * only OFFICIAL (published) bundles. Editors / Subject Admins additionally read any-status
 * bundles (incl. drafts) within the subject-grades they work on. Site Admins read all.
 * With drafts enabled this prevents a plain Teacher from pulling unpublished work via
 * `?draft=true`. `readVersions` mirrors this so the version-history endpoint can't leak drafts.
 */
export const lessonBundleRead: Access = ({ req: { user } }) => {
  const u = user as User
  if (!u) return false
  if (isSiteAdmin(u)) return true
  const scoped = editableSubjectGradeIds(u)
  const where: Where = scoped.length
    ? { or: [{ _status: { equals: 'published' } }, { subjectGrade: { in: scoped } }] }
    : { _status: { equals: 'published' } }
  return where
}

export const lessonBundleReadVersions: Access = ({ req: { user } }) => {
  const u = user as User
  if (!u) return false
  if (isSiteAdmin(u)) return true
  const scoped = editableSubjectGradeIds(u)
  const where: Where = scoped.length
    ? {
        or: [
          { 'version._status': { equals: 'published' } },
          { 'version.subjectGrade': { in: scoped } },
        ],
      }
    : { 'version._status': { equals: 'published' } }
  return where
}

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
