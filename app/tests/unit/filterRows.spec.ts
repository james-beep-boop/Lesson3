/**
 * Pins the library's combined client-side filter (perf fix 2026-07-09): subject + grade + query
 * compose with AND semantics, empty criteria pass everything, and grade matches numerically.
 */
import { describe, expect, it } from 'vitest'

import { filterRows, type LessonRow } from '../../src/lib/substrand.js'

const row = (over: Partial<LessonRow>): LessonRow => ({
  id: 1,
  subjectName: 'Biology',
  grade: 10,
  substrandId: '1.1',
  substrandName: 'Cells',
  strandName: 'Life',
  lessonCount: 3,
  ...over,
})

const ROWS: LessonRow[] = [
  row({ id: 1, subjectName: 'Biology', grade: 10, substrandName: 'Cells' }),
  row({ id: 2, subjectName: 'Biology', grade: 11, substrandName: 'Genetics' }),
  row({ id: 3, subjectName: 'Chemistry', grade: 10, substrandName: 'Acids' }),
]

describe('filterRows', () => {
  it('passes everything with empty criteria', () => {
    expect(filterRows(ROWS, {})).toHaveLength(3)
  })

  it('filters by subject and grade together (AND)', () => {
    expect(filterRows(ROWS, { subject: 'Biology', grade: 10 }).map((r) => r.id)).toEqual([1])
  })

  it('composes the search query with the chips', () => {
    expect(filterRows(ROWS, { grade: 10, q: 'acid' }).map((r) => r.id)).toEqual([3])
    expect(filterRows(ROWS, { subject: 'Biology', q: 'acid' })).toHaveLength(0)
  })

  it('treats a whitespace query and null grade as absent', () => {
    expect(filterRows(ROWS, { q: '   ', grade: null })).toHaveLength(3)
  })
})
