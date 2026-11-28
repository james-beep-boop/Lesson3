import { describe, expect, it } from 'vitest'

import {
  matchSupportingFileName,
  parseSupportingFileName,
  type SupportingFileTarget,
} from '../../src/ingest/supportingFileNames'

describe('supporting file names', () => {
  it.each([
    ['G10_Biology_1.3_L2_QuickCheck.pdf', 'quick-check', 2],
    ['folder/G10_Biology_1.3_L12_AnswerKey.DOCX', 'answer-key', 12],
    ['folder\\G10_Biology_1.3_StudentMaterials.docx', 'student-materials', null],
    ['G10_Biology_1.3_MaterialsTeacherKey.pdf', 'materials-teacher-key', null],
    ['G10_Biology_1.3_AssessmentMaterials.docx', 'assessment-materials', null],
  ])('parses %s without changing the prefix', (file, kind, lessonNumber) => {
    expect(parseSupportingFileName(file)).toMatchObject({
      prefix: 'G10_Biology_1.3',
      kind,
      lessonNumber,
    })
  })

  it.each([
    'G10_Biology_1.3_L0_QuickCheck.pdf',
    'G10_Biology_1.3_L9007199254740993_QuickCheck.pdf',
    'G10_Biology_1.3_QuickCheck.txt',
    'G10_Biology_1.3_QuickCheck.pdf.exe',
    'G10_Biology_1.3_quickcheck.pdf',
    'G10_Biology_1.3_Unknown.pdf',
    '_AnswerKey.pdf',
  ])('leaves %s unmatched', (file) => {
    expect(parseSupportingFileName(file)).toBeNull()
  })

  const target = { id: 1, title: 'Biology', lessons: new Set([1, 2]) }
  const targets = new Map<string, SupportingFileTarget[]>([['G10_Biology_1.3', [target]]])

  it('requires an exact prefix and a lesson that exists in that sub-strand', () => {
    const match = (file: string) => matchSupportingFileName(parseSupportingFileName(file)!, targets)
    expect(match('G10_Biology_1.3_L2_QuickCheck.pdf')).toEqual({ target })
    expect(match('G10_Biology_1.3_AnswerKey.pdf')).toEqual({ target })
    expect(match('G10_Biology_1.3_L3_QuickCheck.pdf')).toHaveProperty('reason')
    expect(match('G10_biology_1.3_L2_QuickCheck.pdf')).toHaveProperty('reason')
    expect(match('G10_Biology_1.30_L2_QuickCheck.pdf')).toHaveProperty('reason')
  })

  it('leaves ambiguity between plans or naming forms unmatched', () => {
    const file = parseSupportingFileName('G10_Biology_1.3_L2_QuickCheck.pdf')!
    const other = { id: 2, title: 'Another plan', lessons: new Set([1]) }
    const samePrefix = new Map([['G10_Biology_1.3', [target, other]]])
    const lessonSuffix = new Map([...targets, ['G10_Biology_1.3_L2', [other]]])
    expect(matchSupportingFileName(file, samePrefix)).toHaveProperty('reason')
    expect(matchSupportingFileName(file, lessonSuffix)).toHaveProperty('reason')
  })
})
