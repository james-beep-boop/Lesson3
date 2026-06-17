/**
 * End-to-end round-trip regression (GATE) — the full DB path in one self-cleaning command.
 *
 * Proves the architecture stays content-faithful through the *stored* path, not just the
 * standalone generator (that is `fidelity-spike.ts`, DB-less). The chain mirrors the manual
 * Phase-4 proof, fully in-process so it needs no Mac round-trip:
 *
 *   seed taxonomy (if missing) → ingest bio_1_4_data.js → 1.0.0 draft → publish → generate
 *   from the DB → diff vs the approved DOCX (LessonSequence Resource column excluded).
 *
 * SELF-CLEANING: every record it creates is tracked and deleted in a `finally` (reverse
 * order), so a pass or a crash both leave the DB as they found it. It is NON-DESTRUCTIVE to
 * existing data — it seeds Biology / Grade 10 only if absent (and then deletes only what it
 * seeded), and ingest always creates a NEW draft, so the live published bundle is untouched.
 *
 * Run (needs a DB — on the Rock, or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/roundtrip-regression.ts
 *
 * Assets come from ARES_DEMO_PATH (default ~/Desktop/ares-docx-fidelity-demo): the trusted
 * `bio_1_4_data.js` + its three approved `Biology_Chemicals_of_Life_*` DOCX. Set ARES_DEMO_PATH
 * to relocate them on the Rock / CI.
 *
 * Exit 0 only when all three documents are content-identical (Resource column excluded);
 * non-zero otherwise.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { ingestPaths } from '../src/ingest'
import { generateForBundle } from '../src/generator/generateForBundle'
import { compareDoc } from './lib/docxDiff'

// bio_1_4's META (verified): the data file resolves to this taxonomy on ingest.
const SUBJECT = 'Biology'
const GRADE = 10
const DATA_FILE = 'bio_1_4_data.js'
const APPROVED = {
  lessonSequence: 'Biology_Chemicals_of_Life_CBE_LessonSequence.docx',
  finalExplanation: 'Biology_Chemicals_of_Life_FinalExplanation.docx',
  summaryTable: 'Biology_Chemicals_of_Life_SummaryTable.docx',
} as const

const DEMO =
  process.env.ARES_DEMO_PATH ?? path.join(os.homedir(), 'Desktop', 'ares-docx-fidelity-demo')
const approved = (file: string) => readFileSync(path.join(DEMO, file))

const run = async () => {
  const payload = await getPayload({ config })

  // Records we create — torn down in reverse in the finally below.
  const created: { collection: 'subjects' | 'subject-grades' | 'lesson-bundles'; id: number | string }[] = []
  let passed = 0
  let cleanupFailed = false
  const total = 3

  // Reuse a pre-existing taxonomy row, or create it and track it for cleanup. The find/create
  // calls stay at the call site (literal collection slugs = type-safe); this only factors the
  // shared reuse-vs-create-then-track-then-log tail the two seed steps share.
  const reuseOrSeed = async (
    collection: 'subjects' | 'subject-grades',
    noun: string,
    existing: { id: number | string } | undefined,
    create: () => Promise<{ id: number | string }>,
  ): Promise<number | string> => {
    if (existing) {
      console.log(`Taxonomy: ${noun} exists (id ${existing.id}) — reusing.`)
      return existing.id
    }
    const doc = await create()
    created.push({ collection, id: doc.id })
    console.log(`Taxonomy: created ${noun} (id ${doc.id}).`)
    return doc.id
  }

  try {
    // 1. Seed taxonomy IF MISSING (track only what we create — leave pre-existing rows alone).
    const subjectId = await reuseOrSeed(
      'subjects',
      `Subject "${SUBJECT}"`,
      (
        await payload.find({
          collection: 'subjects',
          where: { name: { equals: SUBJECT } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
      ).docs[0],
      () => payload.create({ collection: 'subjects', data: { name: SUBJECT }, overrideAccess: true }),
    )

    await reuseOrSeed(
      'subject-grades',
      `SubjectGrade "${SUBJECT} — Grade ${GRADE}"`,
      (
        await payload.find({
          collection: 'subject-grades',
          where: { and: [{ subject: { equals: subjectId } }, { grade: { equals: GRADE } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
      ).docs[0],
      () =>
        payload.create({
          // subjectId is a real (numeric) row id; the relationship field is typed number|Subject.
          collection: 'subject-grades',
          data: { subject: subjectId as number, grade: GRADE },
          overrideAccess: true,
        }),
    )

    // 2. Ingest the trusted demo data file → a fresh 1.0.0 DRAFT (never touches existing bundles).
    const [ingested] = await ingestPaths(payload, [path.join(DEMO, DATA_FILE)])
    if (!ingested) throw new Error(`Ingest produced no bundle for ${DATA_FILE}`)
    created.push({ collection: 'lesson-bundles', id: ingested.id })
    console.log(`Ingested ${DATA_FILE} → bundle id ${ingested.id} · "${ingested.title}" · ${ingested.semver} · ${ingested.status}`)

    // 3. Publish (runs the enforceGeneratable gate; semver bumps but content is unaffected).
    const published = await payload.update({
      collection: 'lesson-bundles',
      id: ingested.id,
      data: { _status: 'published' },
      overrideAccess: true,
    })
    console.log(`Published → ${published.semver} · ${published._status}`)

    // 4. Generate from the stored, published bundle and diff vs the approved DOCX.
    const out = await generateForBundle(payload, ingested.id, 'standard')
    const results = [
      await compareDoc('LessonSequence (SoW)', out.lessonSequence, approved(APPROVED.lessonSequence), true),
      await compareDoc('FinalExplanation', out.finalExplanation, approved(APPROVED.finalExplanation), false),
      await compareDoc('SummaryTable', out.summaryTable, approved(APPROVED.summaryTable), false),
    ]
    passed = results.filter(Boolean).length
  } finally {
    // 5. Tear down everything we created, newest first (bundle → SubjectGrade → Subject).
    for (const { collection, id } of created.reverse()) {
      try {
        await payload.delete({ collection, id, overrideAccess: true })
        console.log(`Cleanup: deleted ${collection} ${id}`)
      } catch (e) {
        cleanupFailed = true
        console.warn(`Cleanup: FAILED to delete ${collection} ${id}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`ROUND-TRIP GATE: ${passed}/${total} documents content-identical (except Resource column)`)
  if (passed !== total) {
    console.error('✗ ROUND-TRIP GATE FAILED')
    process.exit(1)
  }
  // A self-cleaning gate that leaves state behind is a failed gate, even if the diff matched —
  // otherwise CI/Rock runs silently accumulate test rows and hide a cleanup regression.
  if (cleanupFailed) {
    console.error('✗ ROUND-TRIP GATE FAILED — diff matched but cleanup left records behind (see above)')
    process.exit(1)
  }
  console.log('✓ ROUND-TRIP GATE PASSED (seed → ingest → publish → generate → diff, self-cleaned)')
}

// Top-level await — `payload run` only awaits module evaluation (see scripts/ingest.ts).
await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0)
