/**
 * Pins `versionDeliverables` (T2 document strip) to the SAME decision `bundleToAresData` makes —
 * the strip must show exactly what the export will contain, or a teacher gets a button that 404s
 * (strip says Final explanation, generator omits it) or a missing button. The mirror is asserted
 * directly: for each fixture, tag presence must equal the adapter's FINAL_EXPLANATION /
 * SUMMARY_TABLE emission.
 */
import { describe, expect, it } from 'vitest'

import { bundleToAresData, versionDeliverables } from '../../src/generator/adapter.js'
import { DELIVERABLE_LABELS, secondaryDeliverables } from '../../src/generator/deliverables.js'
import type { LessonBundleVersion } from '../../src/payload-types.js'

const CASES: Array<{ name: string; fe: unknown; st: unknown }> = [
  { name: 'both empty groups', fe: {}, st: {} },
  { name: 'both null', fe: null, st: null },
  { name: 'FE with prose', fe: { sections: [{ heading: 'A', body: 'text' }] }, st: {} },
  { name: 'ST with rows', fe: {}, st: { lessons: [{ number: 1, focus: 'x' }] } },
  {
    name: 'whitespace-only strings are empty',
    fe: { sections: [{ heading: '  ', body: '' }] },
    st: {},
  },
  { name: 'both present', fe: { intro: 'i' }, st: { lessons: [{ focus: 'y' }] } },
]

const asBundle = (fe: unknown, st: unknown): LessonBundleVersion =>
  ({
    finalExplanation: fe,
    summaryTable: st,
    meta: {},
    unit: {},
    lessons: [],
  }) as unknown as LessonBundleVersion

describe('versionDeliverables mirrors bundleToAresData (T2 strip contract)', () => {
  it.each(CASES)('$name', ({ fe, st }) => {
    const bundle = asBundle(fe, st)
    const tags = versionDeliverables(bundle)
    const data = bundleToAresData(bundle)
    expect(tags.includes('lessonSequence')).toBe(true) // always present
    expect(tags.includes('finalExplanation')).toBe(data.FINAL_EXPLANATION !== undefined)
    // The teacher key is built from the SAME group as the student document, so the two come and go
    // together — a strip that listed one without the other would offer a button that 404s.
    expect(tags.includes('teacherKey')).toBe(data.FINAL_EXPLANATION !== undefined)
    expect(tags.includes('summaryTable')).toBe(data.SUMMARY_TABLE !== undefined)
  })

  it('lists the documents in document order, and the key is never the primary deliverable', () => {
    const tags = versionDeliverables(asBundle({ intro: 'i' }, { lessons: [{ focus: 'y' }] }))
    expect(tags).toEqual(['lessonSequence', 'finalExplanation', 'teacherKey', 'summaryTable'])
    expect(secondaryDeliverables(tags)).toEqual(['finalExplanation', 'teacherKey', 'summaryTable'])
  })

  it('the key has its own, unmistakable label', () => {
    expect(DELIVERABLE_LABELS.teacherKey).toMatch(/teacher key/i)
    expect(DELIVERABLE_LABELS.teacherKey).toMatch(/not for students/i)
    expect(DELIVERABLE_LABELS.teacherKey).not.toBe(DELIVERABLE_LABELS.finalExplanation)
  })
})
