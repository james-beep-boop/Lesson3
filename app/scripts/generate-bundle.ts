/**
 * Generate the three CBE DOCX for a stored bundle and write them to disk.
 *
 * This is the "script for now" generation path (SPEC §4); the export/sharing UI is §9.
 * It reuses the validity-gated core `generateForBundle` — drafts are refused.
 *
 * Run (needs a DB, so on the Rock or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/generate-bundle.ts -- <bundleId> [outDir] [--format=standard|compact]
 *
 * Writes `<filePrefix>_CBE_LessonSequence.docx`, `_FinalExplanation.docx`,
 * `_SummaryTable.docx` (FE/ST skipped when the bundle has none) to `outDir`
 * (default: a fresh temp dir, path printed at the end).
 *
 * `--format` selects the LessonSequence layout (default `standard`): `compact`
 * drops Section C's Resource column and re-balances widths. FE/ST are identical.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { mkdtempSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { generateForBundle } from '../src/generator/generateForBundle'
import type { LessonSequenceFormat } from '../src/generator/index'
import type { LessonBundle } from '../src/payload-types'

const run = async () => {
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const formatArg = args.find((a) => a.startsWith('--format='))?.split('=')[1]
  const [idArg, outArg] = args.filter((a) => !a.startsWith('--'))
  if (!idArg || (formatArg && formatArg !== 'standard' && formatArg !== 'compact')) {
    console.error(
      'Usage: npx payload run scripts/generate-bundle.ts -- <bundleId> [outDir] [--format=standard|compact]',
    )
    process.exit(1)
  }
  const format: LessonSequenceFormat = formatArg === 'compact' ? 'compact' : 'standard'

  const payload = await getPayload({ config })
  const id = /^\d+$/.test(idArg) ? Number(idArg) : idArg

  const bundle = (await payload.findByID({
    collection: 'lesson-bundles',
    id,
    depth: 0,
    overrideAccess: true,
  })) as LessonBundle
  // `filePrefix` is ingested data — sanitise to a bare filename component (no path
  // separators / traversal) before using it in a path join.
  const prefix = (bundle.meta?.filePrefix || 'bundle').replace(/[^A-Za-z0-9._-]/g, '_') || 'bundle'

  const docx = await generateForBundle(payload, id, format)
  const outDir = outArg ?? mkdtempSync(path.join(os.tmpdir(), 'lesson3-docx-'))

  const written: string[] = []
  const emit = (name: string, buf: Buffer | null) => {
    if (!buf) return
    const file = path.join(outDir, `${prefix}${name}`)
    writeFileSync(file, buf)
    written.push(file)
  }
  emit('_CBE_LessonSequence.docx', docx.lessonSequence)
  emit('_FinalExplanation.docx', docx.finalExplanation)
  emit('_SummaryTable.docx', docx.summaryTable)

  console.log(
    `Bundle ${id} (${bundle.semver}, ${bundle._status}) [${format}] → ${written.length} document(s):`,
  )
  for (const f of written) console.log(`  ${f}`)
}

// Top-level `await` (NOT `run().then(...)`): `payload run` only awaits module evaluation, then
// calls process.exit(0) (payload/dist/bin/index.js) — a detached promise is torn down before the
// async work finishes. See scripts/ingest.ts for the full note.
await run().catch((e) => {
  console.error(e)
  process.exit(1)
})
process.exit(0)
