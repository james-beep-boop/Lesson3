/**
 * Payload-adapter fidelity gate — standalone, no Lesson3 DB.
 *
 * Simulates Payload row ids/native groups around the current Physics 4.1 JSON, proves its complete
 * resourceLinks maps round-trip exactly, then compares all three generated documents to upstream.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { LessonBundleVersion } from '../src/payload-types'
import { bundleToAresData } from '../src/generator/adapter'
import { generateBundleDocx } from '../src/generator/index'
import { extractAresJson } from '../src/ingest/extract'
import { rawToBundle } from '../src/ingest/toBundle'
import { resolveFidelityFixture } from './lib/fidelityFixture'
import { compareDoc, compareLessonSequencePackage } from './lib/docxDiff'
import { withRowIds } from './lib/payloadRowIds'

// Sub-strand selection and the same-commit rule live in `scripts/lib/fidelityFixture.ts`.
const FIXTURE = resolveFidelityFixture()
const JSON_PATH = FIXTURE.jsonPath
const ORACLE_DIR = FIXTURE.oracleDir
const APPROVED = FIXTURE.approved

const approved = (file: string) => readFileSync(path.join(ORACLE_DIR, file))

async function main() {
  const raw = extractAresJson(readFileSync(JSON_PATH, 'utf8'))
  const mapped = rawToBundle(raw)
  const stored = {
    id: 4242,
    lessonPlan: 1,
    subjectGrade: 1,
    semver: '1.0.0',
    title: mapped.title,
    meta: withRowIds(mapped.meta),
    unit: withRowIds(mapped.unit),
    lessons: withRowIds(mapped.lessons),
    finalExplanation: withRowIds(mapped.finalExplanation),
    summaryTable: withRowIds(mapped.summaryTable),
    createdAt: '',
    updatedAt: '',
  } as LessonBundleVersion

  const data = bundleToAresData(stored)
  const rawLessons = raw.LESSONS as Array<Record<string, unknown>>
  const roundTrip = rawLessons.every(
    (lesson, index) =>
      JSON.stringify(lesson.resourceLinks) ===
      JSON.stringify((data.LESSONS[index] as Record<string, unknown>).resourceLinks),
  )
  const cleanShape = !/"id":/.test(JSON.stringify(data))

  console.log(`Payload adapter fidelity gate — ${FIXTURE.label}`)
  console.log(`  ${roundTrip ? '✓' : '✗'} all resourceLinks maps round-trip exactly`)
  console.log(`  ${cleanShape ? '✓' : '✗'} Payload row ids removed`)

  const out = await generateBundleDocx(data)
  const lessonOracle = approved(APPROVED.lessonSequence)
  const results = [
    roundTrip,
    cleanShape,
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
  console.log(`GATE: ${passed}/${results.length} adapter/fidelity checks passed`)
  if (passed !== results.length) process.exit(1)
  console.log('✓ PAYLOAD ADAPTER FIDELITY GATE PASSED')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
