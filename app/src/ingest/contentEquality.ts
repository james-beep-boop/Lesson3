import { canonicalJson } from '../lib/canonicalJson'
import type { IngestBundleData } from './toBundle'
import { toAresResourceLinks } from './resourceLinks'

/** Compare stored content, excluding identity/version metadata and Payload's empty-field padding. */
export function comparableIngestContent(bundle: Partial<IngestBundleData>): string {
  const normalize = (value: unknown): unknown => {
    if (value == null || value === '') return undefined
    if (Array.isArray(value)) return value.length ? value.map(normalize) : undefined
    if (typeof value !== 'object') return value
    const fields = Object.entries(value).flatMap(([key, child]) => {
      if (key === 'id') return []
      // Native resource groups pad an explicit ARES null with empty columns (including booleans).
      const normalized = normalize(key === 'resourceLinks' ? toAresResourceLinks(child) : child)
      return normalized === undefined ? [] : [[key, normalized]]
    })
    return fields.length ? Object.fromEntries(fields) : undefined
  }
  // The write hook derives these numbers from order. Compare what would actually be saved.
  const numbered = (rows: unknown) =>
    Array.isArray(rows)
      ? rows.map((row, i) => ({ ...(row as Record<string, unknown>), number: i + 1 }))
      : rows
  const summary = bundle.summaryTable as Record<string, unknown> | null | undefined
  return canonicalJson(
    normalize({
      title: bundle.title,
      meta: bundle.meta,
      unit: bundle.unit,
      lessons: numbered(bundle.lessons),
      finalExplanation: bundle.finalExplanation,
      summaryTable: summary ? { ...summary, lessons: numbered(summary.lessons) } : summary,
    }),
  )
}
