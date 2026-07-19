/**
 * Map the extracted ARES data (UPPERCASE groups) onto the stored Payload bundle shape
 * (camelCase top-level groups). This is the inverse of the Phase-2 generator adapter
 * (`src/generator/adapter.ts`): the generator consumes `META/UNIT/LESSONS/…`; we store
 * `meta/unit/lessons/…`. The INNER keys already match the ARES data verbatim
 * (`slo.purpose`, `framework[].phase`, `sections[].exemplar`, …), so this is a pure
 * top-level rename plus deriving the human `title` from `META.titleDoc`.
 *
 * Required `LESSONS[].resourceLinks` stays inside each lesson and is converted from the external
 * phase-keyed object to five native Payload child rows; the generator adapter reverses this exactly.
 * Lesson `number`s are left as-is; the `numberBundleVersionRows` hook re-derives them from array
 * order on write.
 */
import type { AresRawBundle } from './extract'
import { aresResourceLinksToRows, isObject } from './resourceLinks'

/** The subset of bundle data ingest sets (cast to the collection's create type at the call site). */
export type IngestBundleData = {
  title: string
  meta: unknown
  unit: unknown
  lessons: unknown
  finalExplanation: unknown
  summaryTable: unknown
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

export function rawToBundle(raw: AresRawBundle): IngestBundleData {
  const meta = (raw.META ?? {}) as Record<string, unknown>
  // Human label for lists (SPEC: title mirrors META.titleDoc). Fall back to substrand name.
  const title =
    asString(meta.titleDoc) || asString(meta.substrand_name) || asString(meta.subject) || 'Untitled bundle'

  const lessons = Array.isArray(raw.LESSONS)
    ? raw.LESSONS.map((lesson) =>
        isObject(lesson)
          ? { ...lesson, resourceLinks: aresResourceLinksToRows(lesson.resourceLinks) }
          : lesson,
      )
    : (raw.LESSONS ?? [])

  return {
    title,
    meta: raw.META ?? {},
    unit: raw.UNIT ?? {},
    lessons,
    finalExplanation: raw.FINAL_EXPLANATION ?? {},
    summaryTable: raw.SUMMARY_TABLE ?? {},
  }
}
