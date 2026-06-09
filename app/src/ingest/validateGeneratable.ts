/**
 * GENERATOR-COMPLETENESS gate (SPEC §5/§7; the export-correctness check).
 *
 * Schema-required fields + publish status are NOT sufficient: the ARES generator
 * dereferences groups the schema leaves optional, so structurally-valid-but-incomplete
 * content crashes generation or silently degrades the document. Verified against the
 * vendored generator (`vendor/lib/sections.js` / `build_docs.js`):
 *
 *   HARD CRASHES (unguarded dereference):
 *     • `lesson.slo.purpose`              → `slo` group must be present   (sections.js:112)
 *     • `lesson.summaryTablePrompt.observed` → group must be present       (sections.js:198)
 *     • `lesson.framework.map(…)`         → `framework` must be an array   (sections.js:170)
 *     • `META.col3Label` / titleBlock     → `META` must be present         (build_docs.js:52)
 *   SILENT DEGRADE:
 *     • a lesson with 0 phases            → empty Section C
 *     • `framework[].phase` outside vocab → grey cell + wrong resource bucket (sections.js:172)
 *
 *   (FINAL_EXPLANATION / SUMMARY_TABLE are fully guarded in the generator — `FE.sections
 *   || []`, `ST.lessons || []`, `|| ''` — so they cannot crash and are not gated here.)
 *
 * Pure: returns a list of human-readable problems (empty = generatable). The ingest
 * script calls it before writing; the `enforceGeneratable` collection hook calls it on
 * publish — single source of truth. Operates on the stored camelCase bundle shape (or the
 * `rawToBundle` output, which is identical).
 */
import { PHASE_VALUES, isPhase } from '../fields/phases'

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

type Bundleish = {
  meta?: unknown
  lessons?: unknown
  finalExplanation?: unknown
  summaryTable?: unknown
}

export function validateGeneratable(bundle: Bundleish): string[] {
  const problems: string[] = []

  if (!isObject(bundle.meta)) {
    problems.push('META group is missing (the generator reads META.titleDoc / col labels).')
  }

  const lessons = bundle.lessons
  if (!Array.isArray(lessons) || lessons.length === 0) {
    problems.push('LESSONS is empty — a bundle must have at least one lesson.')
    return problems // nothing further to check
  }

  lessons.forEach((lessonValue, i) => {
    const n = i + 1 // lesson numbers are 1-based (re-derived from order on save)
    if (!isObject(lessonValue)) {
      problems.push(`Lesson ${n}: not a valid lesson object.`)
      return
    }
    const lesson = lessonValue

    if (!isObject(lesson.slo)) {
      problems.push(`Lesson ${n}: missing SLO group (the generator reads slo.purpose).`)
    }
    if (!isObject(lesson.summaryTablePrompt)) {
      problems.push(
        `Lesson ${n}: missing summaryTablePrompt group (the generator reads .observed/.learned/.explained).`,
      )
    }

    const framework = lesson.framework
    if (!Array.isArray(framework) || framework.length === 0) {
      problems.push(`Lesson ${n}: framework has no phases — at least one phase is required.`)
    } else {
      framework.forEach((phaseValue, j) => {
        const phase = isObject(phaseValue) ? phaseValue.phase : undefined
        if (!isPhase(phase)) {
          problems.push(
            `Lesson ${n}, phase ${j + 1}: invalid phase ${JSON.stringify(phase)} — must be one of: ${PHASE_VALUES.join(', ')}.`,
          )
        }
      })
    }
  })

  return problems
}

/**
 * NON-BLOCKING deliverable warnings (SPEC §3 "three documents per bundle").
 *
 * The generator (and the Phase-2 adapter) SKIP the FinalExplanation / SummaryTable
 * documents when those groups are empty — so an incomplete bundle silently produces only
 * the LessonSequence. SPEC §3 expects all three. Pending confirmation that the whole ARES
 * corpus always carries FE + ST, this is enforced as a WARN-ONLY check at ingest (logged,
 * not a hard publish block — decision 2026-06-09): the operator sees which deliverables a
 * bundle would omit. Promote to a hard gate (fold into `validateGeneratable`) once verified.
 */
export function deliverableWarnings(bundle: Bundleish): string[] {
  const warnings: string[] = []

  const fe = bundle.finalExplanation
  const feSections = isObject(fe) ? fe.sections : undefined
  if (!Array.isArray(feSections) || feSections.length === 0) {
    warnings.push(
      'FINAL_EXPLANATION has no sections — the FinalExplanation document will be skipped (SPEC §3 expects all three documents).',
    )
  }

  const st = bundle.summaryTable
  const stLessons = isObject(st) ? st.lessons : undefined
  if (!Array.isArray(stLessons) || stLessons.length === 0) {
    warnings.push(
      'SUMMARY_TABLE has no lesson rows — the SummaryTable document will be skipped (SPEC §3 expects all three documents).',
    )
  }

  return warnings
}
