/**
 * Whole-corpus render check — standalone, no Lesson3 DB.
 *
 * Generates ALL FOUR documents for every ARES bundle JSON in a directory, runs the on-page preview and the
 * compare-grouping over them, and reports Markdown-table problems. Run it on every generator re-pin or
 * `proseLinks.ts` change; the two fidelity gates each cover ONE sub-strand, this covers the lot.
 *
 *   ARES_CORPUS_DIR=~/Desktop/ares-json npx tsx scripts/corpus-check.ts
 *
 * FAILS (exit 1) when
 *   - the folder cannot be read, or any `.json` in it is MALFORMED (a truncated or corrupt bundle is a
 *     defect, never something to skip); or
 *   - NO bundle was checked (an empty folder, or one holding only manifests, must not look like success); or
 *   - any bundle fails to generate, preview, or group for compare; or
 *   - a document prints a RUN OF TWO OR MORE consecutive `|` paragraphs inside one cell — a Markdown table that
 *     did not render (this is exactly what the old link adapter produced, and what the 2026-10 re-pins fixed).
 * SKIPPED, and counted in the summary: valid JSON that is not a bundle (a manifest, a quiz file).
 * REPORTS, without failing:
 *   - lone `|` lines — usually maths (`|x| = 3`), but a header-only table (one row, no separator) prints the
 *     same way, so each is listed to be read by a person;
 *   - how many framework tables were extracted to a full-width row (`(table below)` pointers).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const JSZip = require('jszip') as {
  loadAsync: (
    b: Buffer,
  ) => Promise<{ file: (n: string) => { async: (t: 'string') => Promise<string> } | null }>
}

import { docxToSections } from '../src/generator/previewBundle'
import { generateBundleDocx, type AresDataObject } from '../src/generator/index'
import { splitDocumentGroups } from '../src/lib/compareGroups'

// compareGroups reads the global `window` (it runs in the browser / jsdom in tests).
;(globalThis as { window?: unknown }).window = new JSDOM('').window

const DIR = process.env.ARES_CORPUS_DIR ?? path.join(os.homedir(), 'Desktop', 'ares-json')

/** Paragraph texts in document order, with a marker at each table-cell end so a run never spans cells. */
function paragraphRuns(xml: string): { lone: string[]; runs: string[][] } {
  const lone: string[] = []
  const runs: string[][] = []
  let run: string[] = []
  const flush = () => {
    if (run.length === 1) lone.push(run[0]!)
    else if (run.length >= 2) runs.push(run)
    run = []
  }
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<\/w:tc>/g)) {
    if (m[0] === '</w:tc>') {
      flush()
      continue
    }
    const text = [...m[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join('')
    if (text.trim().startsWith('|')) run.push(text.trim())
    else flush()
  }
  flush()
  return { lone, runs }
}

async function main() {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
  const failures: string[] = []
  const lone: string[] = []
  let pointers = 0
  let withPointers = 0
  let checked = 0
  let skipped = 0

  for (const file of files) {
    let raw: Partial<AresDataObject>
    try {
      raw = JSON.parse(readFileSync(path.join(DIR, file), 'utf8'))
    } catch (error) {
      failures.push(`${file} is not valid JSON: ${(error as Error).message.split('\n')[0]}`)
      continue
    }
    if (typeof raw !== 'object' || raw === null || !raw.META || !raw.LESSONS) {
      skipped++ // valid JSON that is not a bundle: a manifest, a quiz file
      continue
    }
    try {
      const out = await generateBundleDocx(raw as AresDataObject)
      let filePointers = 0
      for (const [tag, buffer] of Object.entries(out)) {
        if (!buffer) continue
        const zip = await JSZip.loadAsync(buffer as Buffer)
        const xml = (await zip.file('word/document.xml')!.async('string')) ?? ''
        const { lone: l, runs } = paragraphRuns(xml)
        for (const r of runs)
          failures.push(`${file} [${tag}] unrendered table: ${r[0]!.slice(0, 70)}`)
        for (const x of l) lone.push(`${file} [${tag}] ${x.slice(0, 80)}`)
        filePointers += (xml.match(/\(table below\)/g) ?? []).length
      }
      for (const section of await docxToSections(out)) {
        if (splitDocumentGroups(section.label, section.html).length === 0) {
          failures.push(`${file} [${section.label}] compare grouping is empty`)
        }
      }
      pointers += filePointers
      if (filePointers) withPointers++
      checked++
    } catch (error) {
      failures.push(`${file} threw: ${(error as Error).message.split('\n')[0]}`)
    }
  }

  if (checked === 0) {
    failures.push(
      `no bundle was checked in ${DIR} (${files.length} .json file(s), ${skipped} skipped as non-bundle)`,
    )
  }

  // A lone `|` line is either maths (`|x| = 3`) or a header-only table. Three or more pipes is the shape of a
  // header row, so those are the ones a person must decide on; the rest are almost certainly maths.
  const headerLike = lone.filter((l) => (l.match(/\|/g) ?? []).length >= 4)

  console.log(`corpus: ${DIR}`)
  console.log(`bundles checked: ${checked}  (valid JSON skipped as not a bundle: ${skipped})`)
  console.log(
    `framework tables extracted to a full-width row: ${pointers} in ${withPointers} bundle(s)`,
  )
  console.log(
    `lone "|" lines (read each — maths is fine, a header-only table is not): ${lone.length}`,
  )
  for (const l of lone) console.log(`  ${l}`)
  if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):`)
    for (const f of failures) console.log(`  ${f}`)
    process.exit(1)
  }
  console.log(
    `\n✓ ${checked} bundle(s) generated, previewed and grouped; no unrendered multi-row table`,
  )
  if (headerLike.length) {
    console.log(
      `⚠ ${headerLike.length} lone line(s) look like header-only tables and print literally — NOT a pass for those;\n` +
        '  fix the source (add a `|---|` separator row), get upstream to handle it, or accept it in DECISIONS.',
    )
  }
}

main().catch((error) => {
  console.error(`corpus-check could not run: ${(error as Error).message}`)
  process.exit(1)
})
