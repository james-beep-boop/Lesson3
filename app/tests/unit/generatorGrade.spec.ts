import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import {
  generateFinalExplanationDocx,
  generateSummaryTableDocx,
  type AresDataObject,
} from '../../src/generator/index'

const finalExplanation = {
  subjectLabel: 'Biology',
  instructions: 'Explain your thinking.',
  sections: [{ title: 'Evidence', prompt: 'What happened?', exemplar: 'A supported answer.' }],
  rubric: [],
}

const summaryTable = {
  subStrand: 'Cells',
  drivingQuestion: 'How do cells work?',
  lessons: [
    {
      number: 1,
      title: 'Cell structure',
      observed: 'An observation',
      learned: 'A conclusion',
      explained: 'An explanation',
    },
  ],
}

const bundle = (grade?: number): AresDataObject => ({
  META: { subject: 'Biology', ...(grade == null ? {} : { grade }) },
  UNIT: {},
  LESSONS: [],
  FINAL_EXPLANATION: finalExplanation,
  SUMMARY_TABLE: summaryTable,
})

async function documentXml(buffer: Buffer | null): Promise<string> {
  expect(buffer).not.toBeNull()
  const zip = await JSZip.loadAsync(buffer!)
  return zip.file('word/document.xml')!.async('string')
}

describe('generator grade labels', () => {
  it.each([10, 11, 12])('uses META.grade=%i in both assessment deliverables', async (grade) => {
    const data = bundle(grade)
    const [finalXml, summaryXml] = await Promise.all([
      generateFinalExplanationDocx(data).then(documentXml),
      generateSummaryTableDocx(data).then(documentXml),
    ])

    expect(finalXml).toContain(`FINAL EXPLANATION: BIOLOGY GRADE ${grade}`)
    expect(summaryXml.match(new RegExp(`SUMMARY TABLE: BIOLOGY GRADE ${grade}`, 'g'))).toHaveLength(
      2,
    )
  })

  it('refuses to produce assessment documents when META.grade is missing', async () => {
    const data = bundle()

    await expect(generateFinalExplanationDocx(data)).rejects.toThrow(
      'buildFinalExplanation: META.grade is required but missing',
    )
    await expect(generateSummaryTableDocx(data)).rejects.toThrow(
      'buildSummaryTable: META.grade is required but missing',
    )
  })
})
