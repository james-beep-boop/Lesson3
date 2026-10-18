import { afterAll, beforeAll, expect, it } from 'vitest'
import { sql } from '@payloadcms/db-postgres'
import { up, down } from '../../src/migrations/20261018_095242_combine_draft_context'
import { start, capture } from '../../src/lib/editRecovery/kernel'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { drizzleOf, rowsOf } from '../helpers/db'
import type { PayloadRequest } from 'payload'

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
it('adds and rolls back metadata without changing existing draft prose or timestamps', async () => {
  const req = { payload: fx.payload } as PayloadRequest
  const target = { userId: fx.users.editor.id, sourceVersionId: fx.version.id }
  const begun = await start(req, {
    ...target,
    lessonPlanId: fx.plan.id,
    sourceUpdatedAt: fx.version.updatedAt,
    schemaVersion: 'test',
  })
  if (!begun.ok) throw new Error('fixture could not start')
  await capture(req, {
    ...target,
    generation: begun.token.generation,
    expectedRevision: begun.token.revision,
    formDocument: fx.version,
  })
  const read = async () =>
    rowsOf(
      await drizzleOf(fx.payload).execute(
        sql`SELECT content, updated_at, generation, revision FROM edit_recovery WHERE user_id = ${target.userId} AND source_version_id = ${target.sourceVersionId}`,
      ),
    )
  const before = await read()
  await down(args())
  restored = false
  expect(await read()).toEqual(before)
  await up(args())
  restored = true
  expect(await read()).toEqual(before)
})
