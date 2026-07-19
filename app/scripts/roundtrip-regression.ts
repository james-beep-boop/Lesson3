/**
 * End-to-end definitive-1.0.0 round-trip gate (requires Postgres).
 *
 * Current Physics JSON → hard contract/ingest → immutable Official version → Payload adapter →
 * current generator → semantic and package/XML comparison with the upstream DOCX oracle. The raw
 * fixture's substrand_id is changed to a unique test-only value so the gate never revises a real
 * Physics 4.1 plan; that identity is not rendered into the documents.
 *
 * Run on the Rock after applying the resource-link migration:
 *   cd app && npx payload run scripts/roundtrip-regression.ts
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getPayload, type CollectionSlug } from 'payload'
import config from '@payload-config'

import { generateForVersion } from '../src/generator/generateForVersion'
import { ingestItems, type IngestItem } from '../src/ingest'
import { extractAresJson } from '../src/ingest/extract'
import { compareDoc, compareLessonSequencePackage } from './lib/docxDiff'

const SUBJECT = 'Physics'
const GRADE = 10
const JSON_PATH =
  process.env.ARES_FIDELITY_JSON ??
  path.join(os.homedir(), 'Desktop', 'ares-json', 'physics__grade_10__ss_4_1__greenhouse_effect_and_climate_change.json')
const ORACLE_DIR =
  process.env.ARES_FIDELITY_ORACLE_DIR ??
  path.join(
    os.homedir(), 'Documents', 'GitHub', 'cbe-generation-system', 'data', 'outputs', 'v2',
    'Physics', 'SS4.1_Greenhouse_Effect_and_Climate_Change',
  )
const APPROVED = {
  lessonSequence: 'Physics_Greenhouse_Effect_and_Climate_Change_CBE_LessonSequence.docx',
  finalExplanation: 'Physics_Greenhouse_Effect_and_Climate_Change_FinalExplanation.docx',
  summaryTable: 'Physics_Greenhouse_Effect_and_Climate_Change_SummaryTable.docx',
} as const

const approved = (file: string) => readFileSync(path.join(ORACLE_DIR, file))

const run = async () => {
  const payload = await getPayload({ config })
  const created: { collection: CollectionSlug; id: number | string }[] = []
  let cleanupFailed = false
  let passed = 0
  const total = 4

  try {
    const subjectResult = await payload.find({
      collection: 'subjects',
      where: { name: { equals: SUBJECT } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const subject = subjectResult.docs[0] ?? await payload.create({
      collection: 'subjects',
      data: { name: SUBJECT },
      overrideAccess: true,
    })
    if (!subjectResult.docs[0]) created.push({ collection: 'subjects', id: subject.id })

    const subjectGradeResult = await payload.find({
      collection: 'subject-grades',
      where: { and: [{ subject: { equals: subject.id } }, { grade: { equals: GRADE } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const subjectGrade = subjectGradeResult.docs[0] ?? await payload.create({
      collection: 'subject-grades',
      data: { subject: subject.id, grade: GRADE },
      overrideAccess: true,
    })
    if (!subjectGradeResult.docs[0]) created.push({ collection: 'subject-grades', id: subjectGrade.id })

    const raw = structuredClone(extractAresJson(readFileSync(JSON_PATH, 'utf8')))
    const meta = raw.META as Record<string, unknown>
    meta.substrand_id = `4.1-roundtrip-${randomUUID()}`
    const item: IngestItem = { name: path.basename(JSON_PATH), extract: () => raw }
    const [ingested] = await ingestItems(payload, [item])
    if (!ingested || ingested.action !== 'created') {
      throw new Error(`Expected a fresh test plan; got ${ingested?.action ?? 'no ingest result'}`)
    }
    created.push({ collection: 'lesson-plans', id: ingested.id })

    const plan = await payload.findByID({
      collection: 'lesson-plans',
      id: ingested.id,
      depth: 0,
      overrideAccess: true,
    })
    const officialVersionId =
      typeof plan.officialVersion === 'object' && plan.officialVersion
        ? plan.officialVersion.id
        : plan.officialVersion
    if (officialVersionId == null) throw new Error('Ingested test plan has no Official version')
    created.push({ collection: 'lesson-bundle-versions', id: officialVersionId })

    const out = await generateForVersion(payload, officialVersionId)
    const lessonOracle = approved(APPROVED.lessonSequence)
    const results = [
      await compareDoc('LessonSequence (resources included)', out.lessonSequence, lessonOracle, false),
      await compareLessonSequencePackage(
        out.lessonSequence,
        lessonOracle,
        raw.LESSONS as unknown[],
      ),
      await compareDoc('FinalExplanation', out.finalExplanation, approved(APPROVED.finalExplanation), false),
      await compareDoc('SummaryTable', out.summaryTable, approved(APPROVED.summaryTable), false),
    ]
    passed = results.filter(Boolean).length
  } finally {
    for (const record of created) {
      if (record.collection === 'lesson-plans') {
        await payload.update({
          collection: 'lesson-plans', id: record.id, data: { officialVersion: null }, overrideAccess: true,
        }).catch(() => {})
      }
    }
    for (const { collection, id } of created.reverse()) {
      try {
        await payload.delete({ collection, id, overrideAccess: true })
      } catch (error) {
        cleanupFailed = true
        console.warn(`Cleanup failed for ${collection} ${id}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`CURRENT ROUND-TRIP GATE: ${passed}/${total}`)
  if (passed !== total || cleanupFailed) process.exit(1)
  console.log('✓ CURRENT ROUND-TRIP GATE PASSED (ingest → DB → adapter → generator → diff)')
}

await run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
process.exit(0)
