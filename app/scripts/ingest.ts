/**
 * Import ARES data files (`.js` modules OR `.json` exports) as version 1.0.0 Official lesson plans
 * (SPEC §7).
 *
 * DEV-ONLY operator tool — run by the app developer or lesson-plan author, never teachers.
 * `.js` is PARSED, never executed; `.json` is JSON.parse'd — both safe (see
 * src/ingest/extract.ts). Valid files create version 1.0.0 and mark it Official.
 *
 * Run (needs a DB, so on the Rock or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/ingest.ts -- <file.js | file.json | dir> [more…]
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
    console.error('Usage: npx payload run scripts/ingest.ts -- <file.js | file.json | dir> [more…]')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const results = await ingestPaths(payload, paths)

  const createdN = results.filter((r) => r.action !== 'revised').length
  const revisedN = results.length - createdN
  console.log(
    `Ingested ${results.length} file(s): ${createdN} new (Official 1.0.0), ` +
      `${revisedN} revised (next major, Not Official — promote via Make Official):`,
  )
  let warningCount = 0
  for (const r of results) {
    const label = r.action === 'revised' ? 'revised → Not Official' : 'new → Official'
    console.log(`  ${r.file} → plan ${r.id} · "${r.title}" · SG ${r.subjectGrade} · ${r.semver} · ${label}`)
    for (const w of r.warnings) {
      warningCount++
      console.warn(`     ⚠ ${w}`)
    }
  }
  if (warningCount > 0) {
    console.warn(
      `\n${warningCount} non-blocking deliverable warning(s) — these lesson plans imported, but one or more optional deliverables would be omitted.`,
    )
  }
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
