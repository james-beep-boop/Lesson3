/**
 * Generate the three CBE DOCX for a stored bundle and write them to disk.
 *
 * This is the "script for now" generation path (SPEC §4); the export/sharing UI is §9.
 * It reuses the validity-gated core `generateForBundle` — drafts are refused.
 *
 * Run (needs a DB, so on the Rock or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/generate-bundle.ts -- <bundleId> [outDir]
 *
 * Writes `<filePrefix>_CBE_LessonSequence.docx`, `_FinalExplanation.docx`,
 * `_SummaryTable.docx` (FE/ST skipped when the bundle has none) to `outDir`
 * (default: a fresh temp dir, path printed at the end).
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { mkdtempSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { generateForBundle } from '../src/generator/generateForBundle'
import type { LessonBundle } from '../src/payload-types'

const run = async () => {
  const [idArg, outArg] = process.argv.slice(2).filter((a) => a !== '--')
  if (!idArg) {
    console.error('Usage: npx payload run scripts/generate-bundle.ts -- <bundleId> [outDir]')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const id = /^\d+$/.test(idArg) ? Number(idArg) : idArg

  const bundle = (await payload.findByID({
    collection: 'lesson-bundles',
    id,
    depth: 0,
    overrideAccess: true,
  })) as LessonBundle
  const prefix = bundle.meta?.filePrefix || 'bundle'

  const docx = await generateForBundle(payload, id)
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

  console.log(`Bundle ${id} (${bundle.semver}, ${bundle._status}) → ${written.length} document(s):`)
  for (const f of written) console.log(`  ${f}`)
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
