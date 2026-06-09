/**
 * Publish a lesson bundle — mark it official / export-eligible (SPEC §6). Dev/admin tool;
 * the intended path is the admin "Publish" button (the human review gate), but this is handy
 * for scripted/round-trip flows. Publishing runs the `enforceGeneratable` gate, so an
 * incomplete bundle is refused.
 *
 * Run (needs a DB):  cd app && npx payload run scripts/publish-bundle.ts -- <bundleId>
 *
 * NOTE: publishing goes through `enforceBundleStructure`, which currently bumps the semver on
 * every update — so a fresh 1.0.0 becomes 1.0.1 on publish. That does not affect the generated
 * documents; see docs/DECISIONS.md for the open question of whether marking-official should bump.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const run = async () => {
  const [idArg] = process.argv.slice(2).filter((a) => a !== '--')
  if (!idArg) {
    console.error('Usage: npx payload run scripts/publish-bundle.ts -- <bundleId>')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const id = /^\d+$/.test(idArg) ? Number(idArg) : idArg

  const updated = await payload.update({
    collection: 'lesson-bundles',
    id,
    data: { _status: 'published' },
    overrideAccess: true,
  })
  console.log(
    `Published bundle ${updated.id}: "${updated.title}" · ${updated.semver} · ${updated._status}`,
  )
}

// Top-level await — `payload run` only awaits module evaluation (see scripts/ingest.ts).
await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0)
