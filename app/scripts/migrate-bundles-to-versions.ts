/**
 * One-shot data migration (Official-version model): copy each published legacy `lesson-bundles`
 * doc into a `lesson-plans` + `lesson-bundle-versions` 1.0.0 pair, with that snapshot set Official.
 *
 * Background: the Official-version schema (LessonPlan owns stable identity + `officialVersion`;
 * LessonBundleVersion owns immutable snapshots) is live, and INGEST already writes it — but the 13
 * pre-existing published bundles (ids 63–75) were created under the old draft/publish model and
 * have no Plan/Version yet. This backfills them so the new read/export paths have data, after which
 * the legacy `lesson-bundles` collection is retired (Stage 3).
 *
 * The write mirrors ingest's Phase-2 block exactly (create Plan {title, subjectGrade} → create
 * Version {…content, lessonPlan, semver:'1.0.0'} → point Plan.officialVersion at it), so the same
 * version hooks run (numberBundleVersionRows, enforceBundleVersionGeneratable). The whole batch is
 * ONE transaction (all-or-nothing), and the run is IDEMPOTENT: a bundle whose (title, subjectGrade)
 * already has a LessonPlan is skipped, so a re-run after a partial failure is safe.
 *
 * DRY-RUN BY DEFAULT — prints the plan and writes nothing. Pass `--apply` to commit.
 *
 * Run (needs a DB — on the Rock, or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/migrate-bundles-to-versions.ts            # dry-run
 *   cd app && npx payload run scripts/migrate-bundles-to-versions.ts -- --apply # commit
 *
 * Verify after applying with scripts/verify-migration.ts (oracle-free content diff).
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { commitTransaction, initTransaction, killTransaction } from 'payload'
import type { Payload, PayloadRequest } from 'payload'

/** Legacy-only / Payload-internal keys that must NOT carry into a version snapshot. */
const DROP_KEYS = new Set([
  'id',
  'semver',
  'bumpType',
  'lockVersion',
  '_status',
  'createdAt',
  'updatedAt',
])

/** Deep-clone, dropping every nested `id` (array-row ids belong to the source rows, not the copy). */
const stripIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripIds)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'id') continue
      out[k] = stripIds(v)
    }
    return out
  }
  return value
}

/** Numeric id from a relationship value (id number, or populated {id}). */
const relId = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return Number((value as { id: unknown }).id)
  return Number(value)
}

const run = async () => {
  const apply = process.argv.slice(2).includes('--apply')
  const payload = await getPayload({ config })

  // Source: published legacy bundles only (drafts are not migrated — they were never Official).
  const bundles = await payload.find({
    collection: 'lesson-bundles',
    where: { _status: { equals: 'published' } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  // Idempotency index: existing plans keyed by `${title}::${subjectGradeId}`.
  const existingPlans = await payload.find({
    collection: 'lesson-plans',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const planKey = (title: unknown, sg: unknown) => `${String(title)}::${relId(sg)}`
  const alreadyMigrated = new Set(existingPlans.docs.map((p) => planKey(p.title, p.subjectGrade)))

  const todo = bundles.docs.filter((b) => !alreadyMigrated.has(planKey(b.title, b.subjectGrade)))
  const skipped = bundles.docs.length - todo.length

  console.log(
    `Published legacy bundles: ${bundles.docs.length} | already migrated (skip): ${skipped} | to migrate: ${todo.length}`,
  )
  for (const b of todo) {
    console.log(`  • bundle ${b.id} · "${b.title}" · SG ${relId(b.subjectGrade)}`)
  }

  if (todo.length === 0) {
    console.log('\nNothing to do.')
    return
  }
  if (!apply) {
    console.log('\nDRY-RUN — no changes written. Re-run with `-- --apply` to commit.')
    return
  }

  // Write the whole batch in ONE transaction (all-or-nothing), mirroring ingest Phase 2.
  const req = { payload } as Partial<PayloadRequest> & { payload: Payload }
  await initTransaction(req)
  try {
    for (const bundle of todo) {
      const { title, subjectGrade } = bundle as { title: string; subjectGrade: unknown }
      const sg = relId(subjectGrade)

      // Content = the bundle minus legacy/internal keys, with all nested ids stripped.
      const content = stripIds(
        Object.fromEntries(
          Object.entries(bundle as unknown as Record<string, unknown>).filter(
            ([k]) => !DROP_KEYS.has(k),
          ),
        ),
      ) as Record<string, unknown>

      const plan = await payload.create({
        collection: 'lesson-plans',
        data: { title, subjectGrade: sg } as never,
        req,
      })
      const version = await payload.create({
        collection: 'lesson-bundle-versions',
        data: { ...content, lessonPlan: plan.id, subjectGrade: sg, semver: '1.0.0' } as never,
        req,
      })
      await payload.update({
        collection: 'lesson-plans',
        id: plan.id,
        data: { officialVersion: version.id } as never,
        req,
      })
      console.log(
        `  ✓ bundle ${bundle.id} → plan ${plan.id} · version ${version.id} (1.0.0, Official)`,
      )
    }
    await commitTransaction(req)
    console.log(`\n✓ Migrated ${todo.length} bundle(s) into Lesson Plans + Official 1.0.0 versions.`)
  } catch (e) {
    await killTransaction(req)
    throw e
  }
}

// Top-level await — `payload run` only awaits module evaluation (see scripts/ingest.ts).
await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0)
