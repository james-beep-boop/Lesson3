/**
 * Phase 1 fidelity spike (GATE) — standalone, no Lesson3 DB.
 *
 * Proves the pinned vendored generator regenerates the three approved bio_1_4 DOCX
 * with CONTENT identical to the originals, EXCEPT the Section-C Resource column
 * (which Lesson3 leaves empty — single-runtime, no Python recommender).
 *
 * Run:  cd app && npx tsx scripts/fidelity-spike.ts
 *
 * Diff method: DOCX → HTML via mammoth (the sanctioned DOCX→text tool) → DOM via jsdom →
 * ordered list of block texts (paragraphs + table cells). For the LessonSequence we drop
 * the Resource column from both sides before comparing. We aim for content-identity, not
 * byte/zip-identity (styling/metadata legitimately differ).
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generateBundleDocx } from '../src/generator/index'
import { compareDoc } from './lib/docxDiff'

const require = createRequire(import.meta.url)

const DEMO = path.join(os.homedir(), 'Desktop', 'ares-docx-fidelity-demo')
// Trusted demo asset (NOT untrusted ingest — the never-execute rule is Phase 3).
const data = require(path.join(DEMO, 'bio_1_4_data.js'))

const APPROVED = {
  lessonSequence: 'Biology_Chemicals_of_Life_CBE_LessonSequence.docx',
  finalExplanation: 'Biology_Chemicals_of_Life_FinalExplanation.docx',
  summaryTable: 'Biology_Chemicals_of_Life_SummaryTable.docx',
} as const

const approved = (file: string) => readFileSync(path.join(DEMO, file))

async function main() {
  console.log('Phase 1 fidelity spike — bio_1_4 (Chemicals of Life)')
  console.log(`META.filePrefix = ${data.META?.filePrefix} | lessons = ${data.LESSONS?.length}`)

  const out = await generateBundleDocx(data)

  const results = [
    await compareDoc('LessonSequence (SoW)', out.lessonSequence, approved(APPROVED.lessonSequence), true),
    await compareDoc('FinalExplanation', out.finalExplanation, approved(APPROVED.finalExplanation), false),
    await compareDoc('SummaryTable', out.summaryTable, approved(APPROVED.summaryTable), false),
  ]

  const passed = results.filter(Boolean).length
  console.log(`\n${'='.repeat(50)}`)
  console.log(`GATE: ${passed}/${results.length} documents content-identical (except Resource column)`)
  if (passed !== results.length) process.exit(1)
  console.log('✓ Phase 1 GATE PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
