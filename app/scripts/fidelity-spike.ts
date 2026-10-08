/**
 * Current ARES generator fidelity gate — standalone, no Lesson3 DB.
 *
 * Uses the Physics 4.1 JSON and its upstream DOCX outputs by default (any sub-strand: see
 * `scripts/lib/fidelityFixture.ts`). Resources are part of the
 * comparison: no column or paragraph is stripped. The oracle predates Lesson3's explicit
 * parenthesized-prose hyperlinks, so the package gate proves its resource relationships against the
 * oracle and its complete relationship set against the current input.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { generateBundleDocx, type AresDataObject } from '../src/generator/index'
import { extractAresJson } from '../src/ingest/extract'
import { resolveFidelityFixture } from './lib/fidelityFixture'
import { compareDoc, compareLessonSequencePackage } from './lib/docxDiff'

// Sub-strand selection and the same-commit rule live in `scripts/lib/fidelityFixture.ts`.
const FIXTURE = resolveFidelityFixture()
const JSON_PATH = FIXTURE.jsonPath
const ORACLE_DIR = FIXTURE.oracleDir
const APPROVED = FIXTURE.approved

const approved = (file: string) => readFileSync(path.join(ORACLE_DIR, file))

async function main() {
  const data = extractAresJson(readFileSync(JSON_PATH, 'utf8')) as unknown as AresDataObject
  console.log(`Current ARES fidelity gate — ${FIXTURE.label}`)
  console.log(`lessons = ${data.LESSONS.length}`)

  const out = await generateBundleDocx(data)
  const lessonOracle = approved(APPROVED.lessonSequence)
  const results = [
    await compareDoc(
      'LessonSequence (resources included)',
      out.lessonSequence,
      lessonOracle,
      false,
    ),
    await compareLessonSequencePackage(out.lessonSequence, lessonOracle, data),
    await compareDoc(
      'FinalExplanation',
      out.finalExplanation,
      approved(APPROVED.finalExplanation),
      false,
    ),
    await compareDoc('TeacherKey', out.teacherKey, approved(APPROVED.teacherKey), false),
    await compareDoc('SummaryTable', out.summaryTable, approved(APPROVED.summaryTable), false),
  ]

  const passed = results.filter(Boolean).length
  console.log(`\n${'='.repeat(50)}`)
  console.log(
    `GATE: ${passed}/${results.length} content/package checks match current upstream output`,
  )
  if (passed !== results.length) process.exit(1)
  console.log('✓ CURRENT ARES FIDELITY GATE PASSED')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
