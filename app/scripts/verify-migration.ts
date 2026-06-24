/**
 * Verify the legacy-bundle → Plan/Version migration is LOSSLESS, oracle-free.
 *
 * For every published legacy `lesson-bundles` doc, find its migrated Official version (matched by
 * title + subjectGrade) and generate the three CBE DOCX from BOTH the legacy bundle and the new
 * version, then diff them. A pass proves the migrated snapshot regenerates byte-for-byte identically
 * to its source — i.e. the migration carried the content faithfully — without needing the Word
 * oracle DOCX (that stronger gate is roundtrip-regression.ts, which still anchors fidelity to the
 * stakeholder-approved files for bio_1_4).
 *
 * Read-only: generates in-memory, writes nothing. Exit 0 only when ALL bundles match on all three
 * documents (LessonSequence diffed with the Resource column excluded — it is intentionally empty).
 *
 * Run (needs a DB):
 *   cd app && npx payload run scripts/verify-migration.ts
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { bundleToAresData } from '../src/generator/adapter'
import { generateBundleDocx } from '../src/generator'
import type { LessonBundle } from '../src/payload-types'
import { compareDoc } from './lib/docxDiff'

const relId = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return Number((value as { id: unknown }).id)
  return Number(value)
}

const run = async () => {
  const payload = await getPayload({ config })

  const bundles = await payload.find({
    collection: 'lesson-bundles',
    where: { _status: { equals: 'published' } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const versions = await payload.find({
    collection: 'lesson-bundle-versions',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const versionByKey = new Map(
    versions.docs.map((v) => [`${String(v.title)}::${relId(v.subjectGrade)}`, v]),
  )

  let plans = 0
  let passedDocs = 0
  let totalDocs = 0
  const missing: string[] = []

  for (const bundle of bundles.docs) {
    const key = `${String(bundle.title)}::${relId(bundle.subjectGrade)}`
    const version = versionByKey.get(key)
    if (!version) {
      missing.push(`bundle ${bundle.id} "${bundle.title}" — no migrated version`)
      continue
    }
    plans++
    console.log(`\n${'='.repeat(50)}\nbundle ${bundle.id} → version ${version.id} · "${bundle.title}"`)

    const fromBundle = await generateBundleDocx(bundleToAresData(bundle as LessonBundle), 'standard')
    const fromVersion = await generateBundleDocx(
      bundleToAresData(version as unknown as LessonBundle),
      'standard',
    )

    const checks: [string, Buffer | null, Buffer | null, boolean][] = [
      ['LessonSequence', fromVersion.lessonSequence, fromBundle.lessonSequence, true],
      ['FinalExplanation', fromVersion.finalExplanation, fromBundle.finalExplanation, false],
      ['SummaryTable', fromVersion.summaryTable, fromBundle.summaryTable, false],
    ]
    for (const [label, gen, ref, stripResources] of checks) {
      if (gen === null && ref === null) {
        console.log(`── ${label}: both absent — OK`)
        passedDocs++
        totalDocs++
        continue
      }
      totalDocs++
      if (await compareDoc(label, gen, ref as Buffer, stripResources)) passedDocs++
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(
    `MIGRATION VERIFY: ${plans}/${bundles.docs.length} bundles matched to a version; ${passedDocs}/${totalDocs} documents content-identical (Resource column excluded).`,
  )
  if (missing.length > 0) {
    console.error('✗ Unmatched bundles:')
    for (const m of missing) console.error(`  - ${m}`)
  }
  if (missing.length > 0 || passedDocs !== totalDocs) {
    console.error('✗ MIGRATION VERIFY FAILED')
    process.exit(1)
  }
  console.log('✓ MIGRATION VERIFY PASSED (every version regenerates identically to its source bundle)')
}

// Top-level await — `payload run` only awaits module evaluation (see scripts/ingest.ts).
await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0)
