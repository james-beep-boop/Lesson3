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
 *     • `lesson.resourceLinks`            → required stored ARES links      (sections.js:170)
 *     • `META.col3Label` / titleBlock     → `META` must be present         (build_docs.js:52)
 *   SILENT DEGRADE:
 *     • a lesson with 0 phases            → empty Section C
 *     • `framework[].phase` outside vocab → grey cell + wrong resource bucket (sections.js:172)
 *
 *   (FINAL_EXPLANATION / SUMMARY_TABLE are fully guarded in the generator — `FE.sections
 *   || []`, `ST.lessons || []`, `|| ''` — so they cannot crash and are not gated here.)
 *
 * Pure: returns a list of human-readable problems (empty = generatable). The ingest
 * script calls it before writing; the `enforceBundleVersionGeneratable` collection hook calls it
 * on version create — single source of truth. Operates on the stored camelCase content shape (or
 * the `rawToBundle` output, which is identical).
 */
import { isPhase } from '../fields/phases'
import { isObject, validateResourceLinks } from './resourceLinks'

type Bundleish = {
  meta?: unknown
  lessons?: unknown
  finalExplanation?: unknown
  summaryTable?: unknown
}

export interface GeneratableFieldError {
  path: string
  label: string
  message: string
}

/** Retain field paths so save errors can identify the field needing attention. */
export function generatableFieldErrors(bundle: Bundleish): GeneratableFieldError[] {
  const problems: GeneratableFieldError[] = []
  const problem = (path: string, label: string, message: string) => {
    problems.push({ path, label, message })
  }

  if (!isObject(bundle.meta)) {
    problem(
      'meta',
      'Document settings',
      'Document settings are missing. Reload the lesson plan before saving.',
    )
  }

  const lessons = bundle.lessons
  if (!Array.isArray(lessons) || lessons.length === 0) {
    problem('lessons', 'Lessons', 'Keep at least one lesson in the lesson plan.')
    return problems // nothing further to check
  }

  lessons.forEach((lessonValue, i) => {
    const n = i + 1 // lesson numbers are 1-based (re-derived from order on save)
    if (!isObject(lessonValue)) {
      problem(
        `lessons.${i}`,
        `Lesson ${n}`,
        `Lesson ${n}: This lesson is incomplete. Restore it or duplicate an existing lesson.`,
      )
      return
    }
    const lesson = lessonValue

    if (!isObject(lesson.slo)) {
      problem(
        `lessons.${i}.slo`,
        `Lesson ${n} — Specific learning outcomes`,
        `Lesson ${n}: Specific learning outcomes are missing.`,
      )
    }
    if (!isObject(lesson.summaryTablePrompt)) {
      problem(
        `lessons.${i}.summaryTablePrompt`,
        `Lesson ${n} — Lesson summary prompts`,
        `Lesson ${n}: Lesson summary prompts are missing.`,
      )
    }
    for (const message of validateResourceLinks(
      lesson.resourceLinks,
      `Lesson ${n}.resourceLinks`,
    )) {
      problem(`lessons.${i}.resourceLinks`, `Lesson ${n} — Resources`, message)
    }

    const framework = lesson.framework
    if (!Array.isArray(framework) || framework.length === 0) {
      problem(
        `lessons.${i}.framework`,
        `Lesson ${n} — Instructional framework`,
        `Lesson ${n}: Keep at least one instructional phase.`,
      )
    } else {
      framework.forEach((phaseValue, j) => {
        const phase = isObject(phaseValue) ? phaseValue.phase : undefined
        if (!isPhase(phase)) {
          problem(
            `lessons.${i}.framework.${j}.phase`,
            `Lesson ${n}, phase ${j + 1}`,
            `Lesson ${n}, phase ${j + 1}: Choose a phase from the list.`,
          )
        }
      })
    }
  })

  return problems
}

/** Ingest and preview use the same checks as readable messages. */
export function validateGeneratable(bundle: Bundleish): string[] {
  return generatableFieldErrors(bundle).map(({ message }) => message)
}

/**
 * NON-BLOCKING deliverable warnings (SPEC §3 "three documents per bundle").
 *
 * The generator (and the Phase-2 adapter) SKIP the FinalExplanation / SummaryTable
 * documents when those groups are empty, producing only the LessonSequence. Per SPEC §3
 * (confirmed 2026-06-26) **single-document sub-strands are legitimate** — a missing FE/ST is
 * valid content, not incomplete data — so this is an INFORMATIONAL note only and must NEVER
 * become a hard gate (that was the open question; it is now resolved in favour of option (a)).
 * It lets the operator see, at ingest, which deliverables a given bundle will omit. The
 * always-required LessonSequence is gated separately by `validateGeneratable`.
 */
export function deliverableWarnings(bundle: Bundleish): string[] {
  const warnings: string[] = []

  const fe = bundle.finalExplanation
  const feSections = isObject(fe) ? fe.sections : undefined
  if (!Array.isArray(feSections) || feSections.length === 0) {
    warnings.push(
      'FINAL_EXPLANATION has no sections — the FinalExplanation document will be skipped (legitimate for single-document sub-strands; SPEC §3).',
    )
  }

  const st = bundle.summaryTable
  const stLessons = isObject(st) ? st.lessons : undefined
  if (!Array.isArray(stLessons) || stLessons.length === 0) {
    warnings.push(
      'SUMMARY_TABLE has no lesson rows — the SummaryTable document will be skipped (legitimate for single-document sub-strands; SPEC §3).',
    )
  }

  return warnings
}
