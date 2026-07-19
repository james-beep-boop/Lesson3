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
 *   4. Restores Payload's nullable native groups to the exact required lesson-level
 *      `resourceLinks` JSON shape (`video` / `reading` empty groups → explicit `null`).
 *   5. Omits `FINAL_EXPLANATION` / `SUMMARY_TABLE` when the bundle has none, so the
 *      generator skips those documents (matches `generateBundleDocx`'s null contract).
 *
 * The Lesson3-only top-level fields (`semver`, `sourceVersion`, `id`, `createdAt`,
 * `updatedAt`, `title`, `subjectGrade`, `lessonPlan`) are simply not read.
 */
import type { LessonBundleVersion } from '../payload-types'
import type { DeliverableTag } from './exportArtifacts'
import type { AresDataObject } from './index'
import { toAresResourceLinks } from '../ingest/resourceLinks'

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
 * Deep copy that drops Payload's row `id` and normalises ordinary `null` → `''`. The required
 * resourceLinks map is handled as a typed exception so its explicit null records survive.
 */
function clean(value: unknown): unknown {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(clean)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      if (key === 'id') continue
      if (key === 'resourceLinks') {
        out[key] = toAresResourceLinks(v)
        continue
      }
      out[key] = clean(v)
    }
    return out
  }
  return value
}

/**
 * Which deliverables this version's export will contain (teacher-first T2) — the UI's
 * per-document buttons must show EXACTLY what `bundleToAresData` below will emit, so this
 * applies the same clean→hasContent decision to the same two optional groups. LessonSequence
 * always exists.
 */
export function versionDeliverables(
  bundle: Pick<LessonBundleVersion, 'finalExplanation' | 'summaryTable'>,
): DeliverableTag[] {
  const has = (group: unknown): boolean => hasContent(clean(group ?? {}))
  return [
    'lessonSequence',
    ...(has(bundle.finalExplanation) ? (['finalExplanation'] as const) : []),
    ...(has(bundle.summaryTable) ? (['summaryTable'] as const) : []),
  ]
}

/** Map a stored version snapshot to the ARES generator's data object. */
export function bundleToAresData(bundle: LessonBundleVersion): AresDataObject {
  const lessons = asArray(bundle.lessons).map((lesson) => {
    const l = lesson as Record<string, unknown>
    // `clean` already stripped row ids and restored the exact resourceLinks union;
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
