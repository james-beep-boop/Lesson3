/**
 * Current ARES generator fidelity gate — standalone, no Lesson3 DB.
 *
 * Uses the replacement Physics 4.1 JSON and its matching upstream DOCX outputs. Resources are part
 * of the comparison: no column or paragraph is stripped.
 */
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { generateBundleDocx, type AresDataObject } from '../src/generator/index'
import { extractAresJson } from '../src/ingest/extract'
import { compareDoc, compareLessonSequencePackage } from './lib/docxDiff'

const JSON_PATH =
  process.env.ARES_FIDELITY_JSON ??
  path.join(os.homedir(), 'Desktop', 'ares-json', 'physics__grade_10__ss_4_1__greenhouse_effect_and_climate_change.json')
const ORACLE_DIR =
  process.env.ARES_FIDELITY_ORACLE_DIR ??
  path.join(
    os.homedir(),
    'Documents',
    'GitHub',
    'cbe-generation-system',
    'data',
    'outputs',
    'v2',
    'Physics',
    'SS4.1_Greenhouse_Effect_and_Climate_Change',
  )

const APPROVED = {
  lessonSequence: 'Physics_Greenhouse_Effect_and_Climate_Change_CBE_LessonSequence.docx',
  finalExplanation: 'Physics_Greenhouse_Effect_and_Climate_Change_FinalExplanation.docx',
  summaryTable: 'Physics_Greenhouse_Effect_and_Climate_Change_SummaryTable.docx',
} as const

const approved = (file: string) => readFileSync(path.join(ORACLE_DIR, file))

async function main() {
  const data = extractAresJson(readFileSync(JSON_PATH, 'utf8')) as unknown as AresDataObject
  console.log('Current ARES fidelity gate — Physics 4.1 (Greenhouse Effect and Climate Change)')
  console.log(`lessons = ${data.LESSONS.length}`)

  const out = await generateBundleDocx(data)
  const lessonOracle = approved(APPROVED.lessonSequence)
  const results = [
    await compareDoc('LessonSequence (resources included)', out.lessonSequence, lessonOracle, false),
    await compareLessonSequencePackage(out.lessonSequence, lessonOracle, data.LESSONS),
    await compareDoc('FinalExplanation', out.finalExplanation, approved(APPROVED.finalExplanation), false),
    await compareDoc('SummaryTable', out.summaryTable, approved(APPROVED.summaryTable), false),
  ]

  const passed = results.filter(Boolean).length
  console.log(`\n${'='.repeat(50)}`)
  console.log(`GATE: ${passed}/${results.length} content/package checks match current upstream output`)
  if (passed !== results.length) process.exit(1)
  console.log('✓ CURRENT ARES FIDELITY GATE PASSED')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
