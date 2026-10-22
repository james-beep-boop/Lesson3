/**
 * Missing-taxonomy classification for the web upload (SPEC §7, amended 2026-10-21): what is offered
 * for creation, what is asked about as a possible misspelling, and what may never be created.
 */
import { describe, expect, it } from 'vitest'

import { classifyMissingTaxonomy, namesAreSimilar, normalizeSubjectName } from '@/ingest/taxonomy'

const pending = (file: string, subject: string, grade: number, subjectExists = false) => ({
  file,
  subject,
  grade,
  subjectExists,
})

describe('normalizeSubjectName', () => {
  it('ignores letter case and ALL whitespace, including word boundaries', () => {
    expect(normalizeSubjectName('  Life  SKILLS ')).toBe('lifeskills')
    expect(normalizeSubjectName('LifeSkills')).toBe('lifeskills')
  })
})

describe('namesAreSimilar', () => {
  it.each([
    ['Maths', 'Mathematics'],
    ['Chemestry', 'Chemistry'],
    ['Biologi', 'Biology'],
    ['Art', 'Arts'],
    ['Physical Education', 'Physics'],
  ])('%s ~ %s', (a, b) => expect(namesAreSimilar(a, b)).toBe(true))

  it.each([
    ['Art', 'ICT'],
    ['Biology', 'Chemistry'],
    ['History', 'Geography'],
    ['English', 'Kiswahili'],
  ])('%s is not like %s', (a, b) => expect(namesAreSimilar(a, b)).toBe(false))

  it('a case-only difference is not "similar" — it is blocked, which is a different rule', () => {
    expect(namesAreSimilar('mathematics', 'Mathematics')).toBe(false)
  })
})

describe('classifyMissingTaxonomy', () => {
  it('groups a ZIP into one item per (subject, grade), with the files that need it', () => {
    const { offered, blocked } = classifyMissingTaxonomy(
      [
        pending('a.json', 'Geography', 9),
        pending('b.json', 'Geography', 9),
        pending('c.json', 'Geography', 10),
        pending('d.json', 'Biology', 11, true),
      ],
      ['Biology'],
    )
    expect(blocked).toEqual([])
    expect(offered).toEqual([
      {
        subject: 'Geography',
        grade: 9,
        newSubject: true,
        similarTo: [],
        files: ['a.json', 'b.json'],
      },
      { subject: 'Geography', grade: 10, newSubject: true, similarTo: [], files: ['c.json'] },
      { subject: 'Biology', grade: 11, newSubject: false, similarTo: [], files: ['d.json'] },
    ])
  })

  it('never offers a name that differs from an existing subject only by case or spacing', () => {
    const { offered, blocked } = classifyMissingTaxonomy(
      [pending('a.json', 'mathematics', 9), pending('b.json', 'Mathematics  ', 9)],
      ['Mathematics'],
    )
    expect(offered).toEqual([])
    expect(blocked.map((b) => b.file)).toEqual(['a.json', 'b.json'])
    expect(blocked[0]!.error).toContain('only in capitals or spacing')
    expect(blocked[0]!.error).toContain('"Mathematics"')
  })

  it('never offers a name that differs from an existing subject by inserted or deleted spaces', () => {
    const { offered, blocked } = classifyMissingTaxonomy(
      [pending('a.json', 'ComputerScience', 9), pending('b.json', 'Life Skills', 9)],
      ['Computer Science', 'LifeSkills'],
    )
    expect(offered).toEqual([])
    expect(blocked.map((b) => b.error)).toEqual([
      expect.stringContaining('existing subject "Computer Science"'),
      expect.stringContaining('existing subject "LifeSkills"'),
    ])
  })

  it('blocks BOTH spellings when two new names in one upload differ only by a space', () => {
    const { offered, blocked } = classifyMissingTaxonomy(
      [pending('a.json', 'Computer Science', 9), pending('b.json', 'ComputerScience', 9)],
      [],
    )
    expect(offered).toEqual([])
    expect(blocked).toHaveLength(2)
  })

  it('an exact existing name is never blocked as its own near-duplicate (created since lookup)', () => {
    // The file was resolved before a concurrent upload created "Geography"; it now needs only its grade.
    const { offered, blocked } = classifyMissingTaxonomy(
      [pending('a.json', 'Geography', 9, false)],
      ['Geography'],
    )
    expect(blocked).toEqual([])
    expect(offered).toEqual([
      { subject: 'Geography', grade: 9, newSubject: false, similarTo: [], files: ['a.json'] },
    ])
  })

  it('blocks BOTH spellings when two new names in one upload differ only by case', () => {
    const { offered, blocked } = classifyMissingTaxonomy(
      [pending('a.json', 'Physics', 9), pending('b.json', 'physics', 9)],
      [],
    )
    expect(offered).toEqual([])
    expect(blocked).toHaveLength(2)
  })

  it('offers a similar name with similarTo set, against existing AND other new names', () => {
    const { offered } = classifyMissingTaxonomy(
      [pending('a.json', 'Maths', 9), pending('b.json', 'Chemestry', 9)],
      ['Mathematics', 'Chemistry'],
    )
    expect(offered.map((o) => [o.subject, o.similarTo])).toEqual([
      ['Maths', ['Mathematics']],
      ['Chemestry', ['Chemistry']],
    ])
    const both = classifyMissingTaxonomy(
      [pending('a.json', 'Maths', 9), pending('b.json', 'Mathematics', 9)],
      [],
    )
    expect(both.offered.map((o) => o.similarTo)).toEqual([['Mathematics'], ['Maths']])
  })

  it('never offers a grade outside 1–12', () => {
    const { offered, blocked } = classifyMissingTaxonomy(
      [pending('a.json', 'Geography', 13), pending('b.json', 'Biology', 0, true)],
      ['Biology'],
    )
    expect(offered).toEqual([])
    expect(blocked.map((b) => b.error)).toEqual([
      expect.stringContaining('Grade 13 is outside Grades 1–12'),
      expect.stringContaining('Grade 0 is outside Grades 1–12'),
    ])
  })
})
