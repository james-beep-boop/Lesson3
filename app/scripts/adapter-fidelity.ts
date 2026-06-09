/**
 * Phase 2 adapter round-trip proof (GATE) — standalone, no Lesson3 DB.
 *
 * Phase 1 proved: ARES data object → generator → approved DOCX (content-identical).
 * This proves the missing link: a STORED Payload bundle → `bundleToAresData` adapter →
 * generator → the same approved DOCX. By transitivity, bundle → DOCX is faithful.
 *
 * We don't need a DB here: we simulate exactly what Payload stores and returns —
 * camelCase top-level groups, an injected `id` on every array row, Lesson3-only sidebar
 * fields, `null` for empty optionals (UNIT.overview), and an empty `resources` group on
 * each framework phase — then run the real adapter + generator and diff vs the approved
 * set. The true end-to-end DB round-trip + Rock verification is Phase 4.
 *
 * Run:  cd app && npx tsx scripts/adapter-fidelity.ts
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generateBundleDocx } from '../src/generator/index'
import { bundleToAresData } from '../src/generator/adapter'
import { assertExportable, NotExportableError } from '../src/generator/generateForBundle'
import { compareDoc } from './lib/docxDiff'
import type { LessonBundle } from '../src/payload-types'

const require = createRequire(import.meta.url)

// Defaults to the local convention; override with ARES_DEMO_PATH on CI / the Rock.
const DEMO = process.env.ARES_DEMO_PATH ?? path.join(os.homedir(), 'Desktop', 'ares-docx-fidelity-demo')
const data = require(path.join(DEMO, 'bio_1_4_data.js'))
const approved = (file: string) => readFileSync(path.join(DEMO, file))

const APPROVED = {
  lessonSequence: 'Biology_Chemicals_of_Life_CBE_LessonSequence.docx',
  finalExplanation: 'Biology_Chemicals_of_Life_FinalExplanation.docx',
  summaryTable: 'Biology_Chemicals_of_Life_SummaryTable.docx',
} as const

/** Recursively inject a Payload-style `id` on every array row, like a stored doc. */
let rowSeq = 0
function withRowIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((el) => {
      const mapped = withRowIds(el)
      if (mapped && typeof mapped === 'object' && !Array.isArray(mapped)) {
        return { id: `row-${rowSeq++}`, ...(mapped as object) }
      }
      return mapped
    })
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = withRowIds(v)
    return out
  }
  return value
}

/** Build the LessonBundle exactly as Payload would store & return the bio_1_4 data. */
function asStoredBundle(): LessonBundle {
  const lessons = (withRowIds(data.LESSONS) as Record<string, unknown>[]).map((l) => ({
    ...l,
    // bio_1_4 has no resources → Payload stores an empty group; the adapter must drop it.
    framework: (l.framework as Record<string, unknown>[]).map((f) => ({
      ...f,
      resources: { video: { title: null, direct_url: null, search_url: null }, reading: {} },
    })),
  }))

  return {
    id: 4242,
    title: data.META.titleDoc,
    subjectGrade: 1,
    semver: '1.0.0',
    bumpType: 'patch',
    lockVersion: 7,
    _status: 'published',
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
    meta: withRowIds(data.META) as LessonBundle['meta'],
    // UNIT is {} upstream → Payload returns the group with a null overview.
    unit: { overview: null },
    lessons: lessons as LessonBundle['lessons'],
    finalExplanation: withRowIds(data.FINAL_EXPLANATION) as LessonBundle['finalExplanation'],
    summaryTable: withRowIds(data.SUMMARY_TABLE) as LessonBundle['summaryTable'],
  }
}

function gateChecks(): boolean {
  let ok = true
  // Published → allowed.
  try {
    assertExportable({ id: 1, _status: 'published' })
    console.log('  ✓ published bundle is exportable')
  } catch {
    console.log('  ✗ published bundle was wrongly rejected')
    ok = false
  }
  // Draft → refused.
  for (const status of ['draft', undefined] as const) {
    try {
      assertExportable({ id: 1, _status: status })
      console.log(`  ✗ draft (${status}) was NOT refused`)
      ok = false
    } catch (e) {
      if (e instanceof NotExportableError) console.log(`  ✓ draft (${status ?? 'undefined'}) refused`)
      else {
        console.log(`  ✗ unexpected error for ${status}: ${e}`)
        ok = false
      }
    }
  }
  return ok
}

async function main() {
  console.log('Phase 2 adapter round-trip proof — bio_1_4 (Chemicals of Life)')

  console.log('\n── Validity gate ───────────────────────')
  const gateOk = gateChecks()

  const aresData = bundleToAresData(asStoredBundle())
  // Sanity: the adapter output must carry no Payload `id` and no empty resources.
  const json = JSON.stringify(aresData)
  const cleanShape = !/"id":/.test(json) && !/"resources":/.test(json)
  console.log(`\n── Adapter shape ───────────────────────`)
  console.log(`  ${cleanShape ? '✓' : '✗'} no stray Payload "id" / empty "resources" keys`)
  console.log(`  META.filePrefix = ${(aresData.META as { filePrefix?: string })?.filePrefix} | lessons = ${aresData.LESSONS.length}`)

  const out = await generateBundleDocx(aresData)

  const results = [
    gateOk,
    cleanShape,
    await compareDoc('LessonSequence (SoW)', out.lessonSequence, approved(APPROVED.lessonSequence), true),
    await compareDoc('FinalExplanation', out.finalExplanation, approved(APPROVED.finalExplanation), false),
    await compareDoc('SummaryTable', out.summaryTable, approved(APPROVED.summaryTable), false),
  ]

  const passed = results.filter(Boolean).length
  console.log(`\n${'='.repeat(50)}`)
  console.log(`GATE: ${passed}/${results.length} checks passed (gate + adapter shape + 3 docs)`)
  if (passed !== results.length) process.exit(1)
  console.log('✓ Phase 2 adapter round-trip GATE PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
