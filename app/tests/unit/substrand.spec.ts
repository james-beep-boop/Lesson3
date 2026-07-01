import { describe, it, expect } from 'vitest'

import {
  compareSubstrandId,
  strandNumberOf,
  cleanStrandName,
  stripSubjectGradePrefix,
  lessonDisplayName,
  groupLessons,
  orderLessons,
  matchesQuery,
  type LessonRow,
} from '@/lib/substrand'

const sign = (n: number): -1 | 0 | 1 => (n < 0 ? -1 : n > 0 ? 1 : 0)

describe('compareSubstrandId', () => {
  it('orders dotted ids numerically, not lexicographically', () => {
    expect(sign(compareSubstrandId('1.4', '1.10'))).toBe(-1) // 4 < 10
    expect(sign(compareSubstrandId('1.10', '1.4'))).toBe(1)
    expect(sign(compareSubstrandId('2.2', '1.9'))).toBe(1)
  })

  it('treats a shorter id as a prefix that sorts first', () => {
    expect(sign(compareSubstrandId('1.4.1', '1.4'))).toBe(1) // 1.4 < 1.4.1
    expect(sign(compareSubstrandId('1.4', '1.4.1'))).toBe(-1)
  })

  it('is reflexive for equal ids', () => {
    expect(compareSubstrandId('1.4', '1.4')).toBe(0)
  })

  it('sorts missing/invalid ids last', () => {
    expect(sign(compareSubstrandId('1.1', ''))).toBe(-1) // valid before empty
    expect(sign(compareSubstrandId('', '1.1'))).toBe(1)
    expect(sign(compareSubstrandId('1.1', 'abc'))).toBe(-1) // valid before non-numeric
  })
})

describe('strandNumberOf', () => {
  it('returns the first segment as a number', () => {
    expect(strandNumberOf('1.4')).toBe(1)
    expect(strandNumberOf('12.3')).toBe(12)
  })
  it('returns null for missing/invalid ids', () => {
    expect(strandNumberOf('')).toBeNull()
    expect(strandNumberOf('x.y')).toBeNull()
  })
})

const row = (over: Partial<LessonRow>): LessonRow => ({
  id: 1,
  subjectName: 'Biology',
  grade: 10,
  substrandId: '1.1',
  substrandName: 'Cell structure',
  strandName: 'Cell biology',
  lessonCount: 5,
  ...over,
})

describe('groupLessons', () => {
  it('nests sub-strands under strands under subject-grades, each ordered', () => {
    const groups = groupLessons([
      row({ id: 'a', substrandId: '3.2', substrandName: 'Plants', strandName: 'Gaseous exchange' }),
      row({ id: 'b', substrandId: '1.10', substrandName: 'Tenth', strandName: 'Cell biology' }),
      row({ id: 'c', substrandId: '1.4', substrandName: 'Chemicals', strandName: 'Cell biology' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Biology · Grade 10')
    expect(groups[0].strands.map((s) => s.strandNumber)).toEqual([1, 3])
    expect(groups[0].strands[0].label).toBe('Strand 1: Cell biology')
    // Within strand 1: 1.4 before 1.10 (numeric, not lexical).
    expect(groups[0].strands[0].rows.map((r) => r.substrandId)).toEqual(['1.4', '1.10'])
  })
})

describe('cleanStrandName', () => {
  it('strips the stored "Strand N.M:" prefix, leaving the descriptive name', () => {
    expect(cleanStrandName('Strand 2.0: Physiology of Plants')).toBe('Physiology of Plants')
    expect(cleanStrandName('Strand 1.0: Cell Biology and Biodiversity')).toBe(
      'Cell Biology and Biodiversity',
    )
  })
  it('leaves a prefix-less name alone and handles empties/bare ordinals', () => {
    expect(cleanStrandName('Cell biology')).toBe('Cell biology')
    expect(cleanStrandName(null)).toBe('')
    expect(cleanStrandName('Strand 2')).toBe('') // bare ordinal, no descriptive name
  })
})

describe('orderLessons', () => {
  it('returns a flat list in curriculum order across subject-grades, strands, and sub-strands', () => {
    const out = orderLessons([
      row({ id: 'm', subjectName: 'Mathematics', substrandId: '1.1', strandName: 'Numbers' }),
      row({ id: 'b2', subjectName: 'Biology', substrandId: '1.10', strandName: 'Cell biology' }),
      row({ id: 'b1', subjectName: 'Biology', substrandId: '1.4', strandName: 'Cell biology' }),
      row({ id: 'b3', subjectName: 'Biology', substrandId: '3.1', strandName: 'Gaseous exchange' }),
    ])
    // Biology before Mathematics; within Biology, strand 1 (1.4 < 1.10) before strand 3.
    expect(out.map((r) => r.id)).toEqual(['b1', 'b2', 'b3', 'm'])
  })
})

describe('matchesQuery', () => {
  const r = row({ substrandId: '1.4', substrandName: 'Chemicals of life', strandName: 'Cell biology' })
  it('matches across number, name, strand, subject, and grade', () => {
    expect(matchesQuery(r, 'chemicals')).toBe(true)
    expect(matchesQuery(r, '1.4')).toBe(true)
    expect(matchesQuery(r, 'cell')).toBe(true)
    expect(matchesQuery(r, 'grade 10')).toBe(true)
    expect(matchesQuery(r, 'bio 10')).toBe(true) // multi-token AND
  })
  it('does not match unrelated text or lesson-body terms', () => {
    expect(matchesQuery(r, 'photosynthesis')).toBe(false)
  })
  it('returns all rows for an empty query', () => {
    expect(matchesQuery(r, '   ')).toBe(true)
  })
})

describe('stripSubjectGradePrefix', () => {
  it('drops a leading "SUBJECT GRADE N:" prefix', () => {
    expect(stripSubjectGradePrefix('PHYSICS GRADE 10: INTRODUCTION TO SPACE PHYSICS')).toBe(
      'INTRODUCTION TO SPACE PHYSICS',
    )
    expect(stripSubjectGradePrefix('Biology Grade 9: Cell Structure')).toBe('Cell Structure')
  })
  it('leaves an unprefixed title untouched, and tolerates null/empty', () => {
    expect(stripSubjectGradePrefix('Pressure')).toBe('Pressure')
    expect(stripSubjectGradePrefix('')).toBe('')
    expect(stripSubjectGradePrefix(null)).toBe('')
  })
  it('does not over-strip when "grade N:" appears mid-word or without a subject lead', () => {
    // "grade" is whitespace-delimited, so "Upgrade" is not treated as a "… grade" prefix.
    expect(stripSubjectGradePrefix('Upgrade 10: Final Review')).toBe('Upgrade 10: Final Review')
  })
})

describe('lessonDisplayName', () => {
  it('prefers the clean substrand name when present', () => {
    expect(lessonDisplayName('Pressure', 'PHYSICS GRADE 10: PRESSURE')).toBe('Pressure')
  })
  it('falls back to the de-shouted title when no substrand name', () => {
    expect(lessonDisplayName(null, 'PHYSICS GRADE 10: PRESSURE')).toBe('PRESSURE')
    expect(lessonDisplayName('   ', 'Chemistry Grade 10: Acids')).toBe('Acids')
  })
  it('degrades to the raw title, then "Untitled"', () => {
    expect(lessonDisplayName(undefined, 'Just A Title')).toBe('Just A Title')
    expect(lessonDisplayName(null, '')).toBe('Untitled')
    expect(lessonDisplayName(null, null)).toBe('Untitled')
  })
})
