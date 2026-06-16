/**
 * Batch-publish lesson bundles — mark drafts official / export-eligible (SPEC §6).
 *
 * Companion to scripts/publish-bundle.ts (single id). Use this to publish the ingested
 * corpus in one shot. Each publish runs the `enforceGeneratable` gate, so an incomplete
 * bundle is REFUSED (reported, not fatal — the batch continues). Already-published bundles
 * are skipped. Read-only `--list` mode inventories without mutating; `--delete` removes the
 * given draft ids (refuses published bundles).
 *
 * Dev/admin tool; the intended human path is the admin "Publish" button. Publishing a fresh
 * 1.0.0 bumps semver to 1.0.1 (the known no-op-publish bump — see docs/DECISIONS.md).
 *
 * Run (needs a DB, so on the Rock or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/publish-drafts.ts -- --list           # inventory only
 *   cd app && npx payload run scripts/publish-drafts.ts -- --drafts         # publish ALL drafts
 *   cd app && npx payload run scripts/publish-drafts.ts -- 36 37 38         # publish these ids
 *   cd app && npx payload run scripts/publish-drafts.ts -- --delete 36 37   # delete these drafts
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const run = async () => {
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const listOnly = args.includes('--list')
  const allDrafts = args.includes('--drafts')
  const deleteMode = args.includes('--delete')
  const ids = args
    .filter((a) => !a.startsWith('--'))
    .map((a) => (/^\d+$/.test(a) ? Number(a) : a))

  if (!listOnly && !allDrafts && ids.length === 0) {
    console.error(
      'Usage: npx payload run scripts/publish-drafts.ts -- [--list | --drafts | --delete <id> … | <id> …]',
    )
    process.exit(1)
  }

  const payload = await getPayload({ config })

  // Full inventory, newest first — used by --list and to resolve --drafts.
  const all = await payload.find({
    collection: 'lesson-bundles',
    limit: 1000,
    depth: listOnly ? 2 : 0,
    sort: 'id',
    overrideAccess: true,
  })

  if (listOnly) {
    console.log(`Inventory (${all.docs.length} bundle(s)):`)
    for (const b of all.docs) {
      const sg =
        b.subjectGrade && typeof b.subjectGrade === 'object'
          ? `${(b.subjectGrade as any).subject?.name ?? (b.subjectGrade as any).subject ?? '?'} G${(b.subjectGrade as any).grade ?? '?'}`
          : `sg#${b.subjectGrade ?? '?'}`
      const prefix = (b as any).meta?.filePrefix ?? '—'
      const nLessons = Array.isArray((b as any).lessons) ? (b as any).lessons.length : 0
      const fe = (b as any).finalExplanation ? 'FE' : '--'
      const st = (b as any).summaryTable ? 'ST' : '--'
      const created = (b as any).createdAt ? String((b as any).createdAt).slice(0, 19) : '?'
      console.log(
        `  id ${String(b.id).padStart(2)} · ${String(b._status).padEnd(9)} · ${b.semver} · ${sg} · L=${nLessons} ${fe} ${st} · prefix=${prefix} · ${created}`,
      )
      console.log(`        title="${b.title}"`)
    }
    return
  }

  // Delete mode — explicit ids only (never bulk). Guards against removing a published bundle.
  if (deleteMode) {
    if (ids.length === 0) {
      console.error('--delete requires explicit ids (refusing to bulk-delete).')
      process.exitCode = 1
      return
    }
    console.log(`Deleting ${ids.length} bundle(s)…`)
    let deleted = 0
    let refused = 0
    for (const id of ids) {
      const current = all.docs.find((b) => b.id === id)
      if (!current) {
        console.log(`  id ${id} · SKIP (not found)`)
        continue
      }
      if (current._status === 'published') {
        console.log(`  id ${id} · REFUSED (published — unpublish first if intended)`)
        refused++
        continue
      }
      await payload.delete({ collection: 'lesson-bundles', id, overrideAccess: true })
      console.log(`  id ${id} · DELETED · "${current.title}" (${(current as any).meta?.filePrefix})`)
      deleted++
    }
    console.log(`\nDone: ${deleted} deleted, ${refused} refused.`)
    if (refused > 0) process.exitCode = 1
    return
  }

  // Resolve targets: explicit ids, or every current draft.
  const targets = allDrafts
    ? all.docs.filter((b) => b._status === 'draft').map((b) => b.id)
    : ids

  if (targets.length === 0) {
    console.log('No matching draft bundles to publish.')
    return
  }

  console.log(`Publishing ${targets.length} bundle(s)…`)
  let published = 0
  let skipped = 0
  let failed = 0
  for (const id of targets) {
    const current = all.docs.find((b) => b.id === id)
    if (current && current._status === 'published') {
      console.log(`  id ${id} · SKIP (already published · ${current.semver})`)
      skipped++
      continue
    }
    try {
      const updated = await payload.update({
        collection: 'lesson-bundles',
        id,
        data: { _status: 'published' },
        overrideAccess: true,
      })
      console.log(`  id ${id} · OK → ${updated.semver} · "${updated.title}"`)
      published++
    } catch (e) {
      console.error(`  id ${id} · FAILED · ${e instanceof Error ? e.message : e}`)
      failed++
    }
  }
  console.log(`\nDone: ${published} published, ${skipped} skipped, ${failed} failed.`)
  if (failed > 0) process.exitCode = 1
}

// Top-level await — `payload run` only awaits module evaluation (see scripts/ingest.ts).
await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
// Preserve any non-zero exitCode set inside run() (a failed publish / refused delete) so
// CI/deploy scripts see the failure instead of a false success.
process.exit(process.exitCode ?? 0)
