import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { docxToPdf } from '../../src/generator/docxToPdf'
const root = '/oracle/data/outputs/v2'
const samples = [
  [
    'Physics/SS4.1_Greenhouse_Effect_and_Climate_Change',
    'Physics_Greenhouse_Effect_and_Climate_Change',
  ],
  ['Essential_Mathematics/SS1.2_Indices', 'Essential_Mathematics_Indices'],
  ['Maths/SS3.1_Trigonometry_I', 'Mathematics_Trigonometry_I'],
]
await mkdir('/audit-output/pdf-comparison', { recursive: true })
for (const [dir, prefix] of samples)
  for (const [tag, suffix] of [
    ['lessonSequence', 'CBE_LessonSequence'],
    ['finalExplanation', 'FinalExplanation'],
    ['teacherKey', 'FinalExplanation_TeacherKey'],
    ['summaryTable', 'SummaryTable'],
  ]) {
    for (const kind of ['generated', 'oracle']) {
      const input =
        kind === 'generated'
          ? `/audit-output/generated-docx/${prefix}_${tag}.docx`
          : path.join(root, dir, `${prefix}_${suffix}.docx`)
      const pdf = await docxToPdf(await readFile(input))
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
      await writeFile(`/audit-output/pdf-comparison/${prefix}_${tag}_${kind}.pdf`, pdf)
      console.log(
        JSON.stringify({
          sample: prefix,
          document: tag,
          kind,
          pdfBytes: pdf.length,
          validPdfHeader: true,
        }),
      )
    }
  }
