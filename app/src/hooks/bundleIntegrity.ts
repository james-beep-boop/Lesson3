import type { CollectionBeforeChangeHook } from 'payload'
import { Forbidden } from 'payload'

import type { User } from '@/payload-types'
import { isSubjectAdminFor, toId } from '../access'

// ---------------------------------------------------------------------------
// Semver helpers (SPEC §6)
// ---------------------------------------------------------------------------

const bumpSemver = (current: string, bump: string): string => {
  const parts = (current ?? '1.0.0').split('.').map(Number)
  const [major = 1, minor = 0, patch = 0] = parts
  switch (bump) {
    case 'major': return `${major + 1}.0.0`
    case 'minor': return `${major}.${minor + 1}.0`
    default:      return `${major}.${minor}.${patch + 1}`
  }
}

/**
 * Structural + field-level integrity for LessonBundles (SPEC §5, §13).
 *
 * Subject Admins / Site Admins are unrestricted. For everyone else (Editors), this hook:
 *
 *  1. Re-derives the system-only lesson numbers from array order.
 *  2. Rejects any change to array cardinality or order (Editors edit values, not structure).
 *  3. Enforces the field-level split with a WHITELIST: the written document is the original
 *     with ONLY the Editor-editable *prose* fields overlaid from the submission. Everything
 *     not on the prose whitelist (META, phase, durations, answer keys, structure, system
 *     fields…) is preserved from the original.
 *
 * Why a whitelist (not field-level access): Payload's field access NULLS optional admin-only
 * subfields inside open arrays when a non-admin submits the array (it would wipe answer keys,
 * durations, etc.), so those subfields carry no field-level `access` (see fields/bundleFields.ts)
 * and protection lives here. A whitelist is also *secure by default*: a newly added admin/system
 * field is protected automatically — forgetting to list a field can only make it non-editable by
 * an Editor (a visible annoyance), never silently editable (a security hole). Hook output is
 * authoritative — verified it is not re-stripped after beforeChange.
 *
 * Only arrays present in the incoming `data` are touched; omitted parents are retained intact
 * by Payload's merge (these fields have no access to strip them), so partial updates are safe.
 */

type Doc = Record<string, any>
type Row = { id?: string | number }

const idSequence = (rows?: Row[] | null): Array<string | number | undefined> =>
  (rows ?? []).map((r) => r.id)

const sameSequence = (
  a: Array<string | number | undefined>,
  b: Array<string | number | undefined>,
): boolean => a.length === b.length && a.every((v, i) => v === b[i])

// Editor-editable prose fields, by container. Anything NOT listed is admin/system and is
// preserved from the original. Keep these in sync with the `prose()` fields in LessonBundles.
const LESSON_PROSE = ['title', 'overview', 'teacherReflection']
const SLO_PROSE = [
  'purpose',
  'knowledge',
  'skills',
  'attitudes',
  'keyInquiry',
  'purposeInStoryline',
  'safetyNotes',
]
const FRAMEWORK_PROSE = [
  'learnerExperience',
  'teacherMoves',
  'sensemakingStrategy',
  'formativeAssessment',
]
const SUMMARY_PROMPT_PROSE = ['observed', 'learned', 'explained']
const FINAL_EXPLANATION_PROSE = ['instructions']
const SECTION_PROSE = ['prompt']
const SUMMARY_LESSON_PROSE = ['title', 'observed', 'learned', 'explained']

/** Return a copy of `base` with only `proseKeys` overlaid from `sub` (when present). */
const overlayProse = (base: Doc, sub: Doc | undefined, proseKeys: string[]): Doc => {
  const out: Doc = { ...base }
  if (sub) for (const key of proseKeys) if (key in sub) out[key] = sub[key]
  return out
}

/** Map submitted array rows back onto their originals by id, overlaying only prose. */
const overlayRows = (
  base: Doc[] | undefined,
  submitted: Doc[],
  proseKeys: string[],
  perRow?: (baseRow: Doc, subRow: Doc, out: Doc) => void,
): Doc[] => {
  const byId = new Map((base ?? []).map((r) => [r.id, r]))
  return submitted.map((sub) => {
    const baseRow = byId.get(sub.id)
    if (!baseRow) return sub // unreachable: cardinality/order already validated
    const out = overlayProse(baseRow, sub, proseKeys)
    perRow?.(baseRow, sub, out)
    return out
  })
}

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

  // 2. Versioning (SPEC §6) — runs for all users on every save.
  if (operation === 'create') {
    data.semver = '1.0.0'
    data.lockVersion = 0
    data.bumpType = 'patch'
  } else if (operation === 'update' && originalDoc) {
    data.semver = bumpSemver(originalDoc.semver ?? '1.0.0', data.bumpType ?? 'patch')
    data.bumpType = 'patch' // reset after consuming
    data.lockVersion = (originalDoc.lockVersion ?? 0) + 1
  }

  // 3. Structure + field protection only apply to updates by non-admins.
  if (operation !== 'update' || !originalDoc || !data) return data
  const subjectGradeId = toId((data.subjectGrade ?? originalDoc.subjectGrade) as never)
  if (isSubjectAdminFor(req.user as User, subjectGradeId)) return data

  const reject = (): never => {
    throw new Forbidden(req.t)
  }

  // 2a. Cardinality / order is structural — Editors may not change it.
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

  // 2b. WHITELIST: write = original, with only prose overlaid from the submission.
  const orig = originalDoc as Doc
  const d = data as Doc

  // No Editor-editable fields at the top level or in the META/UNIT groups → preserve.
  d.title = orig.title
  d.subjectGrade = orig.subjectGrade
  d.meta = orig.meta
  d.unit = orig.unit
  // Publishing (marking official, SPEC §6) is Subject Admin only.
  d._status = orig._status ?? 'draft'

  if (Array.isArray(d.lessons)) {
    d.lessons = overlayRows(orig.lessons, d.lessons as Doc[], LESSON_PROSE, (baseRow, subRow, out) => {
      out.slo = overlayProse((baseRow.slo ?? {}) as Doc, subRow.slo as Doc, SLO_PROSE)
      out.summaryTablePrompt = overlayProse(
        (baseRow.summaryTablePrompt ?? {}) as Doc,
        subRow.summaryTablePrompt as Doc,
        SUMMARY_PROMPT_PROSE,
      )
      if (Array.isArray(subRow.framework)) {
        out.framework = overlayRows(
          baseRow.framework as Doc[] | undefined,
          subRow.framework as Doc[],
          FRAMEWORK_PROSE,
        )
      }
    })
  }

  if (d.finalExplanation) {
    const feo = (orig.finalExplanation ?? {}) as Doc
    const sub = d.finalExplanation as Doc
    const out = overlayProse(feo, sub, FINAL_EXPLANATION_PROSE)
    if (Array.isArray(sub.sections)) {
      out.sections = overlayRows(feo.sections as Doc[] | undefined, sub.sections as Doc[], SECTION_PROSE)
    }
    d.finalExplanation = out
  }

  if (d.summaryTable) {
    const sto = (orig.summaryTable ?? {}) as Doc
    const sub = d.summaryTable as Doc
    const out = overlayProse(sto, sub, []) // subStrand, drivingQuestion are admin-only
    if (Array.isArray(sub.lessons)) {
      out.lessons = overlayRows(sto.lessons as Doc[] | undefined, sub.lessons as Doc[], SUMMARY_LESSON_PROSE)
    }
    d.summaryTable = out
  }

  return data
}
