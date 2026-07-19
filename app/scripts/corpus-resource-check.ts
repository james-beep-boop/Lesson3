/**
 * DB-free replacement-corpus gate.
 *
 * Validates every JSON file against the definitive 1.0.0 contract and proves every lesson-level
 * resourceLinks map survives raw JSON → ingest mapping → simulated Payload row ids → generator
 * adapter exactly. Defaults to the user's current replacement corpus; CI/Rock can set
 * ARES_JSON_CORPUS_DIR and expected counts.
 */
import { readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { LessonBundleVersion } from '../src/payload-types'
import { bundleToAresData } from '../src/generator/adapter'
import { contractDrift } from '../src/ingest/contract'
import { extractAresJson } from '../src/ingest/extract'
import { rawToBundle } from '../src/ingest/toBundle'
import { withRowIds } from './lib/payloadRowIds'

const corpusDir = process.env.ARES_JSON_CORPUS_DIR ?? path.join(os.homedir(), 'Desktop', 'ares-json')
const expectedFiles = Number(process.env.ARES_JSON_EXPECTED_FILES ?? 42)
const expectedLessons = Number(process.env.ARES_JSON_EXPECTED_LESSONS ?? 384)

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'manifest' ? [] : jsonFiles(resolved)
    return entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json'
      ? [resolved]
      : []
  })
}

const files = jsonFiles(corpusDir).sort()
let lessons = 0
const failures: string[] = []

for (const file of files) {
  const raw = extractAresJson(readFileSync(file, 'utf8'))
  const drift = contractDrift(raw)
  if (drift.length) {
    failures.push(`${path.basename(file)}: ${drift.join(' | ')}`)
    continue
  }

  const mapped = rawToBundle(raw)
  mapped.lessons = withRowIds(mapped.lessons)
  const adapted = bundleToAresData({
    id: 1,
    lessonPlan: 1,
    subjectGrade: 1,
    semver: '1.0.0',
    title: mapped.title,
    meta: mapped.meta,
    unit: mapped.unit,
    lessons: mapped.lessons,
    finalExplanation: mapped.finalExplanation,
    summaryTable: mapped.summaryTable,
    createdAt: '',
    updatedAt: '',
  } as LessonBundleVersion)

  const rawLessons = raw.LESSONS as Array<Record<string, unknown>>
  lessons += rawLessons.length
  rawLessons.forEach((lesson, index) => {
    const roundTrip = adapted.LESSONS[index] as Record<string, unknown>
    if (JSON.stringify(roundTrip.resourceLinks) !== JSON.stringify(lesson.resourceLinks)) {
      failures.push(`${path.basename(file)} LESSONS[${index}].resourceLinks: round-trip mismatch`)
    }
  })
}

if (files.length !== expectedFiles) {
  failures.push(`corpus file count: expected ${expectedFiles}, found ${files.length}`)
}
if (lessons !== expectedLessons) {
  failures.push(`corpus lesson count: expected ${expectedLessons}, found ${lessons}`)
}

console.log(`ARES replacement corpus: ${files.length} file(s), ${lessons} lesson(s)`)
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}
console.log('  ✓ all files conform to definitive 1.0.0')
console.log('  ✓ every resourceLinks map round-trips exactly through the Payload adapter boundary')
