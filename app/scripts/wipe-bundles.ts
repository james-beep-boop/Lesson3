/**
 * Reset the lesson-bundle corpus — delete ALL lesson bundles (published included), so the
 * corpus can be re-ingested clean. Companion to scripts/publish-drafts.ts, whose `--delete`
 * deliberately refuses published bundles; this tool removes them too, for a full wipe.
 *
 * DESTRUCTIVE + dev/admin only. Requires an explicit `--yes` to actually delete (a bare run
 * lists what WOULD be removed and exits). Each delete is a Payload Local-API call with
 * overrideAccess, which cascades the bundle's version rows. Used to land the "clean and fresh"
 * re-ingest after the UNIT model change (docs/DECISIONS.md) — version lineage beyond 1.0.0 is
 * disposable in early testing.
 *
 * Run (needs a DB, so on the Rock or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/wipe-bundles.ts            # dry run: list only
 *   cd app && npx payload run scripts/wipe-bundles.ts -- --yes   # actually delete all
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const run = async () => {
  const confirmed = process.argv.slice(2).includes('--yes')
  const payload = await getPayload({ config })

  const all = await payload.find({
    collection: 'lesson-bundles',
    limit: 1000,
    depth: 0,
    sort: 'id',
    overrideAccess: true,
  })

  if (all.docs.length === 0) {
    console.log('No lesson bundles to delete — corpus already empty.')
    return
  }

  console.log(`${all.docs.length} bundle(s):`)
  for (const b of all.docs) {
    console.log(`  id ${b.id} · ${b._status} · ${b.semver} · ${b.title ?? '(untitled)'}`)
  }

  if (!confirmed) {
    console.log('\nDry run — nothing deleted. Re-run with `-- --yes` to delete all of the above.')
    return
  }

  let deleted = 0
  for (const b of all.docs) {
    await payload.delete({ collection: 'lesson-bundles', id: b.id, overrideAccess: true })
    deleted++
  }
  console.log(`\n✓ Deleted ${deleted} bundle(s). Corpus is empty — ready for a fresh re-ingest.`)
}

await run()
process.exit(0)
