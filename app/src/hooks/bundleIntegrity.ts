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

  // Enforce admin-only field VALUES for Editors. These fields carry NO field-level
  // access (see fields/bundleFields.ts): Payload's field access nulls optional admin-only
  // subfields inside open arrays when a non-admin submits the array, which would WIPE
  // answer keys/durations/etc. Without that stripping, a parent omitted by the Editor is
  // retained intact by Payload's merge, and a parent the Editor *did* submit is corrected
  // here by overwriting its admin-only values from the original. Hook output is
  // authoritative — verified it is not re-stripped after beforeChange (SPEC §5).
  type Doc = Record<string, any>
  const orig = originalDoc as Doc
  const d = data as Doc

  d.title = orig.title
  d.subjectGrade = orig.subjectGrade

  if (Array.isArray(d.lessons)) {
    const byId = new Map((orig.lessons ?? []).map((l: Doc) => [l.id, l]))
    for (const lesson of d.lessons as Doc[]) {
      const o = byId.get(lesson.id) as Doc | undefined
      if (!o) continue
      lesson.duration = o.duration
      lesson.substrand = o.substrand
      lesson.aresKeywords = o.aresKeywords
      if (Array.isArray(lesson.framework)) {
        const fById = new Map((o.framework ?? []).map((f: Doc) => [f.id, f]))
        for (const fw of lesson.framework as Doc[]) {
          const of = fById.get(fw.id) as Doc | undefined
          if (of) fw.phase = of.phase
        }
      }
    }
  }

  if (d.finalExplanation) {
    const feo = (orig.finalExplanation ?? {}) as Doc
    d.finalExplanation.subjectLabel = feo.subjectLabel
    d.finalExplanation.rubric = feo.rubric
    if (Array.isArray(d.finalExplanation.sections)) {
      const sById = new Map((feo.sections ?? []).map((s: Doc) => [s.id, s]))
      for (const sec of d.finalExplanation.sections as Doc[]) {
        const o = sById.get(sec.id) as Doc | undefined
        if (o) {
          sec.title = o.title
          sec.exemplar = o.exemplar
        }
      }
    }
  }

  if (d.summaryTable) {
    const sto = (orig.summaryTable ?? {}) as Doc
    d.summaryTable.subStrand = sto.subStrand
    d.summaryTable.drivingQuestion = sto.drivingQuestion
  } else {
    d.summaryTable = orig.summaryTable
  }

  return data
}
