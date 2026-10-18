/** Exercise the actual up/down SQL against populated pre-change tables on the isolated test DB. */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { down, up } from '../../src/migrations/20261018_072213_combine_lineage'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { drizzleOf, rowsOf } from '../helpers/db'
import { sql } from '@payloadcms/db-postgres'

let fx: RoleFixture
let restored = true
const args = () => ({ db: drizzleOf(fx.payload) }) as Parameters<typeof up>[0]
beforeAll(async () => {
  fx = await setupRoleFixture()
}, 120_000)
afterAll(async () => {
  if (!restored) await up(args())
  await fx?.teardown()
})

it('backfills existing chains, is idempotent, preserves content/timestamps and rolls back cleanly', async () => {
  const make = (semver: string, sourceVersion: number) =>
    fx.payload.create({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      data: {
        title: `${MARK}migration`,
        semver,
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        sourceVersion,
        ...minimalBundleContent(),
      } as never,
    })
  const parent = await make('2.0.0', fx.version.id)
  const child = await make('2.0.1', parent.id)
  await down(args())
  restored = false
  await down(args()) // rollback is idempotent
  const before = rowsOf(
    await drizzleOf(fx.payload).execute(sql`
    SELECT id, updated_at, title, source_version_id FROM lesson_bundle_versions ORDER BY id
  `),
  )
  await up(args())
  restored = true
  await up(args()) // rerun must not duplicate lineage entries
  const after = rowsOf(
    await drizzleOf(fx.payload).execute(sql`
    SELECT id, updated_at, title, source_version_id FROM lesson_bundle_versions ORDER BY id
  `),
  )
  expect(after).toEqual(before)
  const saved = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: child.id,
    depth: 0,
  })
  expect(saved.lineage).toEqual([fx.version.id, parent.id].sort((a, b) => a - b))
  const root = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: fx.version.id,
    depth: 0,
  })
  expect(root.lineage ?? []).toEqual([])

  await fx.payload.delete({
    collection: 'lesson-bundle-versions',
    id: parent.id,
    overrideAccess: true,
  })
  await up(args()) // preserve already-recorded ancestry past a now-deleted parent
  const surviving = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: child.id,
    depth: 0,
  })
  expect(surviving.sourceVersion).toBeNull()
  expect(surviving.lineage).toEqual(saved.lineage)
}, 60_000)
