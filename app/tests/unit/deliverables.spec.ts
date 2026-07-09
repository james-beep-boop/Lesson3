/**
 * Pins `versionDeliverables` (T2 document strip) to the SAME decision `bundleToAresData` makes —
 * the strip must show exactly what the export will contain, or a teacher gets a button that 404s
 * (strip says Final explanation, generator omits it) or a missing button. The mirror is asserted
 * directly: for each fixture, tag presence must equal the adapter's FINAL_EXPLANATION /
 * SUMMARY_TABLE emission.
 */
import { describe, expect, it } from 'vitest'

import { bundleToAresData, versionDeliverables } from '../../src/generator/adapter.js'
import type { LessonBundleVersion } from '../../src/payload-types.js'

const CASES: Array<{ name: string; fe: unknown; st: unknown }> = [
  { name: 'both empty groups', fe: {}, st: {} },
  { name: 'both null', fe: null, st: null },
  { name: 'FE with prose', fe: { sections: [{ heading: 'A', body: 'text' }] }, st: {} },
  { name: 'ST with rows', fe: {}, st: { lessons: [{ number: 1, focus: 'x' }] } },
  { name: 'whitespace-only strings are empty', fe: { sections: [{ heading: '  ', body: '' }] }, st: {} },
  { name: 'both present', fe: { intro: 'i' }, st: { lessons: [{ focus: 'y' }] } },
]

const asBundle = (fe: unknown, st: unknown): LessonBundleVersion =>
  ({ finalExplanation: fe, summaryTable: st, meta: {}, unit: {}, lessons: [] }) as unknown as LessonBundleVersion

describe('versionDeliverables mirrors bundleToAresData (T2 strip contract)', () => {
  it.each(CASES)('$name', ({ fe, st }) => {
    const bundle = asBundle(fe, st)
    const tags = versionDeliverables(bundle)
    const data = bundleToAresData(bundle)
    expect(tags.includes('lessonSequence')).toBe(true) // always present
    expect(tags.includes('finalExplanation')).toBe(data.FINAL_EXPLANATION !== undefined)
    expect(tags.includes('summaryTable')).toBe(data.SUMMARY_TABLE !== undefined)
  })
})
