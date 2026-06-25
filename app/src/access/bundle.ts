import type { FieldAccess } from 'payload'

import type { User } from '@/payload-types'
import type { Assignment } from './index'
import { isEditorFor, isSubjectAdminFor, toId } from './index'

/**
 * Field-level access for the lesson-plan content fields (SPEC §5), shared by the
 * `lesson-bundle-versions` collection (and `lesson-plans` for its structural fields).
 *
 * Editors edit prose values; Subject Admins additionally edit META / aresKeywords / phase /
 * duration / structure / answer keys; the resource column and lesson numbers are system-only.
 * The authoritative Editor/admin split for array rows lives in the field-split hook
 * (`hooks/fieldSplit.ts`); these field-access fns cover the create/UI path.
 */

// The subject-grade this field's document belongs to: existing doc on update,
// incoming data on create.
const subjectGradeIdFor = (args: { doc?: unknown; data?: unknown }): number | undefined => {
  const doc = args.doc as { subjectGrade?: Assignment['subjectGrade'] } | undefined
  const data = args.data as { subjectGrade?: Assignment['subjectGrade'] } | undefined
  return toId(doc?.subjectGrade ?? data?.subjectGrade)
}

/** Editors (and above) may set this field's value. */
export const canEditProse: FieldAccess = ({ req: { user }, doc, data }) =>
  isEditorFor(user as User, subjectGradeIdFor({ doc, data }))

/** Subject Admins (and Site Admins) only — META, phase, duration, answer keys, structure. */
export const canEditStructure: FieldAccess = ({ req: { user }, doc, data }) =>
  isSubjectAdminFor(user as User, subjectGradeIdFor({ doc, data }))

/** System-only: the resource column and lesson numbers are never user-editable; they
 *  are set by ingest/order via the structural hook (which runs after field access). */
export const systemOnly: FieldAccess = () => false
