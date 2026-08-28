import { describe, expect, it } from 'vitest'

import { formatRowLabel } from '@/components/RowLabel/formatRowLabel'

describe('formatRowLabel', () => {
  it.each([
    ['Section 1 — The Foundation', 'Section 1 — The Foundation'],
    ['Section 1 - The Foundation', 'Section 1 — The Foundation'],
    ['section 1: The Foundation', 'Section 1 — The Foundation'],
    ['Section 1 The Foundation', 'Section 1 — The Foundation'],
    ['Section 1', 'Section 1'],
  ])('does not repeat a prefix already present in %j', (title, expected) => {
    expect(formatRowLabel('Section', 1, title)).toBe(expected)
  })

  it('applies the same de-duplication to every configured row noun', () => {
    expect(formatRowLabel('Lesson', 2, 'Lesson 2 — Cells')).toBe('Lesson 2 — Cells')
    expect(formatRowLabel('Phase', 3, 'Phase 3 – Explain')).toBe('Phase 3 — Explain')
    expect(formatRowLabel('Rubric row', 4, 'Rubric row 4: Evidence')).toBe(
      'Rubric row 4 — Evidence',
    )
    expect(formatRowLabel('Lesson row', 5, 'Lesson row 5 — Reflect')).toBe(
      'Lesson row 5 — Reflect',
    )
  })

  it('keeps an unrelated title, preserves row-number boundaries, and uses the empty fallback', () => {
    expect(formatRowLabel('Section', 1, 'The Foundation')).toBe(
      'Section 1 — The Foundation',
    )
    expect(formatRowLabel('Section', 1, 'Section 10 — Later')).toBe(
      'Section 1 — Section 10 — Later',
    )
    expect(formatRowLabel('Section', 1, '   ')).toBe('Section 1')
  })

  it('uses only the first line and truncates long detail text', () => {
    expect(formatRowLabel('Section', 1, 'Section 1 — First line\nSecond line')).toBe(
      'Section 1 — First line',
    )
    const formatted = formatRowLabel('Section', 1, `Section 1 — ${'x'.repeat(70)}`)
    expect(formatted).toBe(`Section 1 — ${'x'.repeat(59)}…`)
  })
})
