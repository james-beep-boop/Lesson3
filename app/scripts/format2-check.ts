/**
 * Format-2 (compact LessonSequence) structural check — standalone, no Lesson3 DB.
 *
 * Proves the per-export `format: 'compact'` path:
 *   1. Section C ("Lesson Implementation Framework") has FIVE columns, not six —
 *      the Resource column is gone.
 *   2. Its column widths are exactly [2261, 2854, 2854, 2854, 2857] DXA
 *      (Phase 1.57"; the other four split the 13680 DXA content width evenly).
 *   3. The `standard` path is unchanged: Section C keeps its six columns,
 *      starting [900, 2300, 2556, ...], i.e. the Resource column is still present.
 *   4. FinalExplanation and SummaryTable are byte-identical across both formats.
 *
 * Diff method: unzip word/document.xml from each buffer, pull every <w:tblGrid>'s
 * <w:gridCol w:w="…"> widths, and assert on the Section-C grids.
 *
 * Run:  cd app && npx tsx scripts/format2-check.ts
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
import { generateBundleDocx } from '../src/generator/index'

const require = createRequire(import.meta.url)
type Zip = { file: (p: string) => { async: (t: 'string') => Promise<string> } | null }
const JSZip = require('jszip') as { loadAsync: (b: Buffer) => Promise<Zip> }

/** Read a zip entry, failing the gate clearly if it's missing (JSZip.file() returns null). */
async function readEntry(zip: Zip, name: string): Promise<string> {
  const file = zip.file(name)
  if (!file) throw new Error(`DOCX is missing "${name}" — not a valid Office Open XML file`)
  return file.async('string')
}

/** word/document.xml — the content payload, free of the per-build timestamp in docProps/core.xml. */
async function documentXml(buf: Buffer): Promise<string> {
  return readEntry(await JSZip.loadAsync(buf), 'word/document.xml')
}

const DEMO = process.env.ARES_DEMO_PATH ?? path.join(os.homedir(), 'Desktop', 'ares-docx-fidelity-demo')
const data = require(path.join(DEMO, 'bio_1_4_data.js'))

const STANDARD_C = [900, 2300, 2556, 3324, 2300, 2300]
const COMPACT_C = [2261, 2854, 2854, 2854, 2857]

/** Every table's gridCol widths, in document order. */
async function tableGrids(buf: Buffer): Promise<number[][]> {
  const xml = await readEntry(await JSZip.loadAsync(buf), 'word/document.xml')
  const grids: number[][] = []
  for (const m of xml.matchAll(/<w:tblGrid>(.*?)<\/w:tblGrid>/gs)) {
    grids.push([...m[1].matchAll(/<w:gridCol\s+w:w="(\d+)"/g)].map((g) => Number(g[1])))
  }
  return grids
}

const eq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])

async function main() {
  const lessons = (data.LESSONS ?? []).length
  console.log(`bio_1_4 — ${lessons} lessons\n`)

  const std = await generateBundleDocx(data, 'standard')
  const cmp = await generateBundleDocx(data, 'compact')

  const stdGrids = await tableGrids(std.lessonSequence)
  const cmpGrids = await tableGrids(cmp.lessonSequence)

  const stdSectionC = stdGrids.filter((g) => eq(g, STANDARD_C))
  const cmpSectionC = cmpGrids.filter((g) => eq(g, COMPACT_C))

  const checks: [string, boolean][] = [
    [`standard: ${lessons} Section-C grids = [${STANDARD_C}] (6 cols, Resource present)`,
      stdSectionC.length === lessons],
    [`standard: no 5-col compact grid leaked in`,
      !stdGrids.some((g) => eq(g, COMPACT_C))],
    [`compact: ${lessons} Section-C grids = [${COMPACT_C}] (5 cols, Resource removed)`,
      cmpSectionC.length === lessons],
    [`compact: no 6-col standard Section-C grid remains`,
      !cmpGrids.some((g) => eq(g, STANDARD_C))],
    [`compact: every Section-C grid sums to 13680 DXA (content width, no overflow)`,
      cmpSectionC.every((g) => g.reduce((a, b) => a + b, 0) === 13680)],
    [`FinalExplanation content identical across formats`,
      (await documentXml(std.finalExplanation!)) === (await documentXml(cmp.finalExplanation!))],
    [`SummaryTable content identical across formats`,
      (await documentXml(std.summaryTable!)) === (await documentXml(cmp.summaryTable!))],
  ]

  let ok = true
  for (const [label, pass] of checks) {
    console.log(`${pass ? '✓' : '✗'} ${label}`)
    if (!pass) ok = false
  }

  console.log(`\n${'='.repeat(50)}`)
  if (!ok) {
    console.log('✗ FORMAT-2 CHECK FAILED')
    process.exit(1)
  }
  console.log('✓ FORMAT-2 CHECK PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
