/**
 * Editor field-split (SPEC §5) — the WHITELIST that constrains a non-admin Editor's writes to prose
 * values, preserving all structure / admin / system fields from the original. Enforces the Editor/
 * Admin boundary for the `lesson-bundle-versions` working copies (via `enforceVersionFieldSplit`).
 *
 * Subject Admins / Site Admins (and trusted system / overrideAccess calls with no `req.user`) are
 * unrestricted. For an Editor this:
 *   1. Rejects any change to array cardinality or order (Editors edit values, not structure).
 *   2. Writes = the original with ONLY the Editor-editable *prose* fields overlaid from the
 *      submission. Everything not on the prose whitelist (META, phase, durations, answer keys,
 *      structure, system fields, identity/version metadata…) is preserved from the original.
 *
 * Why a whitelist (not field-level access): Payload field access NULLS optional admin-only subfields
 * inside open arrays when a non-admin submits the array, so those subfields carry no field-level
 * `access` and protection lives here. A whitelist is also secure by default: a NEW admin/system field
 * is preserved automatically — forgetting to list a field can only make it non-editable by an Editor
 * (a visible annoyance), never silently Editor-writable (a security hole).
 *
 * The set of TOP-LEVEL keys an Editor may influence is passed in (`editorTopLevelKeys`), so the
 * whitelist stays decoupled from any one collection's identity/version metadata.
 */
import type { CollectionBeforeChangeHook } from 'payload'
import { Forbidden } from 'payload'

import type { User } from '@/payload-types'
import { isSubjectAdminFor, toId } from '../access'

type Doc = Record<string, any>
type Row = { id?: string | number }
type Req = Parameters<CollectionBeforeChangeHook>[0]['req']

const idSequence = (rows?: Row[] | null): Array<string | number | undefined> =>
  (rows ?? []).map((r) => r.id)

const sameSequence = (
  a: Array<string | number | undefined>,
  b: Array<string | number | undefined>,
): boolean => a.length === b.length && a.every((v, i) => v === b[i])

// Editor-editable prose fields, by container. Anything NOT listed is admin/system and is preserved
// from the original. Keep in sync with the `prose()` fields in fields/lessonContent.ts.
const LESSON_PROSE = ['title', 'overview', 'teacherReflection']
const SLO_PROSE = ['purpose', 'knowledge', 'skills', 'attitudes', 'keyInquiry', 'purposeInStoryline', 'safetyNotes']
const FRAMEWORK_PROSE = ['learnerExperience', 'teacherMoves', 'sensemakingStrategy', 'formativeAssessment']
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

/**
 * Apply the Editor whitelist to `data` (an UPDATE candidate), parameterised by the top-level keys an
 * Editor may influence on this collection. Mutates and returns `data`. Caller is responsible for any
 * numbering/versioning that should run for ALL users (kept out of here).
 */
export const applyEditorFieldSplit = ({
  data,
  originalDoc,
  operation,
  req,
  editorTopLevelKeys,
}: {
  data: Doc | undefined
  originalDoc: Doc | undefined
  operation: string
  req: Req
  editorTopLevelKeys: Set<string>
}): Doc | undefined => {
  if (operation !== 'update' || !originalDoc || !data) return data
  const subjectGradeId = toId((data.subjectGrade ?? originalDoc.subjectGrade) as never)
  // Subject Admins are unrestricted. A missing user = trusted system / overrideAccess call
  // (unauthenticated updates are denied at collection access) — treat as trusted too.
  if (!req.user || isSubjectAdminFor(req.user as User, subjectGradeId)) return data

  const reject = (): never => {
    throw new Forbidden(req.t)
  }

  // 1. Cardinality / order is structural — Editors may not change it.
  if ('lessons' in data) {
    if (!sameSequence(idSequence(originalDoc.lessons), idSequence(data.lessons))) reject()
    const prevById = new Map((originalDoc.lessons ?? []).map((l: Row & { framework?: Row[] }) => [l.id, l]))
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
    if ('sections' in fe && !sameSequence(idSequence(feBefore.sections), idSequence(fe.sections))) reject()
    if ('rubric' in fe && !sameSequence(idSequence(feBefore.rubric), idSequence(fe.rubric))) reject()
  }
  if (data.summaryTable && 'lessons' in data.summaryTable) {
    const stBefore = originalDoc.summaryTable ?? {}
    if (!sameSequence(idSequence(stBefore.lessons), idSequence(data.summaryTable.lessons))) reject()
  }

  // 2. WHITELIST: write = original, with only prose overlaid from the submission.
  const orig = originalDoc as Doc
  const d = data as Doc

  // Restore EVERY top-level key from the original except the ones an Editor legitimately influences
  // (the content containers overlaid below + collection-specific version fields). So a NEW top-level
  // field nobody wired up is reset to the original automatically.
  for (const key of Object.keys(d)) {
    if (editorTopLevelKeys.has(key)) continue
    d[key] = orig[key]
  }

  if (Array.isArray(d.lessons)) {
    d.lessons = overlayRows(orig.lessons, d.lessons as Doc[], LESSON_PROSE, (baseRow, subRow, out) => {
      out.slo = overlayProse((baseRow.slo ?? {}) as Doc, subRow.slo as Doc, SLO_PROSE)
      out.summaryTablePrompt = overlayProse(
        (baseRow.summaryTablePrompt ?? {}) as Doc,
        subRow.summaryTablePrompt as Doc,
        SUMMARY_PROMPT_PROSE,
      )
      if (Array.isArray(subRow.framework)) {
        out.framework = overlayRows(baseRow.framework as Doc[] | undefined, subRow.framework as Doc[], FRAMEWORK_PROSE)
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
