/**
 * Ingest ARES `.js` data modules as version 1.0.0 DRAFT bundles (SPEC §7).
 *
 * DEV-ONLY operator tool — run by the app developer or lesson-plan author, never teachers.
 * Safe static extraction (the `.js` is PARSED, never executed — see src/ingest/extract.ts).
 * Bundles are created as drafts; an administrator reviews and publishes to make them
 * official / exportable.
 *
 * Run (needs a DB, so on the Rock or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/ingest.ts -- <file.js | dir> [more…]
 *
 * Taxonomy must already exist: each module's (META.subject, META.grade) is resolved to a
 * SubjectGrade by exact match; a missing Subject/SubjectGrade is a hard error (seed first).
 * The batch is all-or-nothing: any failure writes nothing.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { ingestPaths } from '../src/ingest'

const run = async () => {
  const paths = process.argv.slice(2).filter((a) => a !== '--')
  if (paths.length === 0) {
    console.error('Usage: npx payload run scripts/ingest.ts -- <file.js | dir> [more…]')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const results = await ingestPaths(payload, paths)

  console.log(`Ingested ${results.length} bundle(s) as 1.0.0 drafts:`)
  let warningCount = 0
  for (const r of results) {
    console.log(`  ${r.file} → id ${r.id} · "${r.title}" · SG ${r.subjectGrade} · ${r.semver} · ${r.status}`)
    for (const w of r.warnings) {
      warningCount++
      console.warn(`     ⚠ ${w}`)
    }
  }
  if (warningCount > 0) {
    console.warn(
      `\n${warningCount} non-blocking deliverable warning(s) — these bundles ingested as drafts but would omit a document. Review before publishing.`,
    )
  }
  console.log('Review and publish each bundle (admin) to make it official / exportable.')
}

// Top-level `await` (NOT fire-and-forget `run().then(...)`): `payload run` only awaits the
// module's EVALUATION, then calls process.exit(0) unconditionally (payload/dist/bin/index.js).
// A detached promise would be torn down before getPayload/ingest finish — exit 0, no work,
// no output. Top-level await keeps evaluation pending until run() completes. (run() calls
// process.exit itself, so this also exits cleanly under `tsx`, where the DB pool stays open.)
await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0) // explicit so it also exits under `tsx` (getPayload keeps the DB pool open)
