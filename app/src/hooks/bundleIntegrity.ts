import type { CollectionBeforeChangeHook } from 'payload'
import { Forbidden } from 'payload'

import type { User } from '@/payload-types'
import { isSubjectAdminFor, toId } from '../access'

/**
 * Structural integrity for LessonBundles (SPEC §5, §13).
 *
 * Payload field access can gate a field's *value* (a subfield with `update: false`
 * silently keeps its existing value) but it CANNOT stop someone from adding,
 * removing, or reordering array *rows*. So this hook, running server-side:
 *
 *  1. Re-derives the system-only lesson numbers from array order.
 *  2. For Editors (anyone who is not Subject Admin / Site Admin for the bundle's
 *     subject-grade) rejects any change to array cardinality or order — they may edit
 *     prose values but not structure. Subject Admins are unrestricted here.
 *
 * Only arrays actually present in the incoming `data` are checked, so partial
 * (REST PATCH) updates that omit a section are not treated as deletions.
 */

type Row = { id?: string | number }

const idSequence = (rows?: Row[] | null): Array<string | number | undefined> =>
  (rows ?? []).map((r) => r.id)

const sameSequence = (
  a: Array<string | number | undefined>,
  b: Array<string | number | undefined>,
): boolean => a.length === b.length && a.every((v, i) => v === b[i])

export const enforceBundleStructure: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  // 1. System-only numbering, derived from order.
  if (Array.isArray(data?.lessons)) {
    data.lessons.forEach((lesson: { number?: number }, i: number) => {
      lesson.number = i + 1
    })
  }
  if (Array.isArray(data?.summaryTable?.lessons)) {
    data.summaryTable.lessons.forEach((lesson: { number?: number }, i: number) => {
      lesson.number = i + 1
    })
  }

  // 2. Structural protection only applies to updates by non-admins.
  if (operation !== 'update' || !originalDoc || !data) return data
  const subjectGradeId = toId((data.subjectGrade ?? originalDoc.subjectGrade) as never)
  if (isSubjectAdminFor(req.user as User, subjectGradeId)) return data

  const reject = (): never => {
    throw new Forbidden(req.t)
  }

  if ('lessons' in data) {
    if (!sameSequence(idSequence(originalDoc.lessons), idSequence(data.lessons))) reject()
    const prevById = new Map(
      (originalDoc.lessons ?? []).map((l: Row & { framework?: Row[] }) => [l.id, l]),
    )
    for (const lesson of data.lessons ?? []) {
      const prev = prevById.get(lesson.id) as { framework?: Row[] } | undefined
      if (prev && 'framework' in lesson) {
        if (!sameSequence(idSequence(prev.framework), idSequence(lesson.framework))) reject()
      }
    }
  }

  if (data.finalExplanation) {
    const fe = data.finalExplanation
    const feBefore = originalDoc.finalExplanation ?? {}
    if ('sections' in fe && !sameSequence(idSequence(feBefore.sections), idSequence(fe.sections)))
      reject()
    if ('rubric' in fe && !sameSequence(idSequence(feBefore.rubric), idSequence(fe.rubric)))
      reject()
  }

  if (data.summaryTable && 'lessons' in data.summaryTable) {
    const stBefore = originalDoc.summaryTable ?? {}
    if (!sameSequence(idSequence(stBefore.lessons), idSequence(data.summaryTable.lessons)))
      reject()
  }

  return data
}
