/**
 * Map the extracted ARES data (UPPERCASE groups) onto the stored Payload bundle shape
 * (camelCase top-level groups). This is the inverse of the Phase-2 generator adapter
 * (`src/generator/adapter.ts`): the generator consumes `META/UNIT/LESSONS/…`; we store
 * `meta/unit/lessons/…`. The INNER keys already match the ARES data verbatim
 * (`slo.purpose`, `framework[].phase`, `sections[].exemplar`, …), so this is a pure
 * top-level rename plus deriving the human `title` from `META.titleDoc`.
 *
 * `framework[].resources` is carried through if present, omitted otherwise (the Resource
 * column is DEFERRED — see docs/DECISIONS.md). Lesson `number`s are left as-is; the
 * `enforceBundleStructure` hook re-derives them from array order on write.
 */
import type { AresRawBundle } from './extract'

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

  return {
    title,
    meta: raw.META ?? {},
    unit: raw.UNIT ?? {},
    lessons: raw.LESSONS ?? [],
    finalExplanation: raw.FINAL_EXPLANATION ?? {},
    summaryTable: raw.SUMMARY_TABLE ?? {},
  }
}
