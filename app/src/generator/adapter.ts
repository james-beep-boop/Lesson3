/**
 * Adapter: a stored Payload lesson-plan `LessonBundleVersion` → the ARES generator's data object.
 *
 * Lesson3 stores the bundle as native Payload nested fields with camelCase top-level
 * groups (`meta`, `unit`, `lessons`, `finalExplanation`, `summaryTable`). The ARES
 * generator (see `index.ts`) consumes UPPERCASE groups (`META`, `UNIT`, `LESSONS`,
 * `FINAL_EXPLANATION`, `SUMMARY_TABLE`). The *inner* keys already match ARES verbatim
 * (e.g. `slo.purpose`, `framework[].phase`, `sections[].exemplar`), so the adapter only:
 *
 *   1. Renames the five top-level groups.
 *   2. Strips Payload-injected `id` from every array row.
 *   3. Converts `null` → `''` — Payload returns `null` for empty optional strings, but
 *      the generator's `cell()`/`para()` assume strings (a raw `null` would break docx).
 *      ARES data files never contain `null`; this restores that invariant.
 *   4. Drops empty `framework[].resources` (the Resource column is DEFERRED — see
 *      docs/DECISIONS.md). The optional field is retained as the future seam: a
 *      *populated* `resources` is carried through untouched.
 *   5. Omits `FINAL_EXPLANATION` / `SUMMARY_TABLE` when the bundle has none, so the
 *      generator skips those documents (matches `generateBundleDocx`'s null contract).
 *
 * The Lesson3-only top-level fields (`semver`, `sourceVersion`, `id`, `createdAt`,
 * `updatedAt`, `title`, `subjectGrade`, `lessonPlan`) are simply not read.
 */
import type { LessonBundleVersion } from '../payload-types'
import type { AresDataObject } from './index'

/** True if any leaf string under `value` is non-empty (used to prune empty groups). */
function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.some(hasContent)
  if (value && typeof value === 'object') return Object.values(value).some(hasContent)
  return value != null
}

/**
 * Force a generator-iterated slot to an array. The generator unconditionally `.map()`s
 * over LESSONS, `lesson.framework`, FE.sections, FE.rubric and ST.lessons; Payload
 * normally returns `[]` for empty arrays, but a missing/null value would otherwise be
 * turned into `''` by `clean()` and crash `.map`. Guard those exact slots.
 */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value.map(clean) : []
}

/**
 * Deep copy that drops Payload's row `id`, normalises `null` → `''`, and prunes empty
 * `resources` groups. Pure (does not mutate the input).
 */
function clean(value: unknown): unknown {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(clean)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      if (key === 'id') continue
      const cleaned = clean(v)
      // Resource column deferred: drop when empty, carry through when populated.
      if (key === 'resources' && !hasContent(cleaned)) continue
      out[key] = cleaned
    }
    return out
  }
  return value
}

/** Map a stored version snapshot to the ARES generator's data object. */
export function bundleToAresData(bundle: LessonBundleVersion): AresDataObject {
  const lessons = asArray(bundle.lessons).map((lesson) => {
    const l = lesson as Record<string, unknown>
    // `clean` already stripped ids / pruned empty resources inside each framework row;
    // re-assert framework is an array so a null/missing value can't crash the generator.
    l.framework = Array.isArray(l.framework) ? l.framework : []
    return l
  })

  const fe = clean(bundle.finalExplanation ?? {}) as Record<string, unknown>
  fe.sections = Array.isArray(fe.sections) ? fe.sections : []
  fe.rubric = Array.isArray(fe.rubric) ? fe.rubric : []

  const st = clean(bundle.summaryTable ?? {}) as Record<string, unknown>
  st.lessons = Array.isArray(st.lessons) ? st.lessons : []

  return {
    META: clean(bundle.meta ?? {}),
    UNIT: clean(bundle.unit ?? {}),
    LESSONS: lessons,
    FINAL_EXPLANATION: hasContent(fe) ? fe : undefined,
    SUMMARY_TABLE: hasContent(st) ? st : undefined,
  }
}
