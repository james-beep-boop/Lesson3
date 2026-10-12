/** Real up/down/backfill on the disposable integration DB; no live database is used. */
import { beforeAll, afterAll, expect, it } from 'vitest'
import { sql } from '@payloadcms/db-postgres'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { drizzleOf, rowsOf } from '../helpers/db'
import { up, down } from '../../src/migrations/20261012_012355_add_message_version_labels'

let fx: RoleFixture
beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)
afterAll(async () => {
  await fx?.teardown()
})

it('backfills surviving versions, preserves whole-lesson and already-lost legacy references, and supports rollback', async () => {
  const content = minimalBundleContent()
  const saved = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.0.1',
      title: 'BIOLOGY GRADE 99: OLD TITLE',
      ...content,
      meta: { ...content.meta, substrand_name: 'Structured lesson name' },
    } as never,
  })
  const create = (version?: number) =>
    fx.payload.create({
      collection: 'messages',
      overrideAccess: true,
      data: {
        sender: fx.users.teacher.id,
        recipient: fx.users.editor.id,
        body: `${MARK}Backfill`,
        lessonPlan: fx.plan.id,
        ...(version ? { version } : {}),
      },
    })
  const live = await create(saved.id)
  const whole = await create()
  const lost = await create(saved.id)
  const db = drizzleOf(fx.payload)
  const batchBody = `${MARK}Backfill multiple batches`
  await db.execute(sql`
    INSERT INTO messages (sender_id, recipient_id, body, lesson_plan_id, version_id)
    SELECT ${fx.users.teacher.id}, ${fx.users.editor.id}, ${batchBody}, ${fx.plan.id}, ${saved.id}
      FROM generate_series(1, 501)
  `)
  await db.execute(sql`UPDATE messages SET version_id = NULL WHERE id = ${lost.id}`)
  const args = { db, payload: fx.payload, req: {} } as never
  await down(args)
  await up(args)
  const rows = rowsOf<{ id: number; version_label: string | null }>(
    await db.execute(sql`
    SELECT id, version_label FROM messages WHERE id IN (${live.id}, ${whole.id}, ${lost.id})
  `),
  )
  const labels = new Map(rows.map((row) => [row.id, row.version_label]))
  expect(labels.get(live.id)).toBe('Structured lesson name · v1.0.1')
  expect(labels.get(whole.id)).toBeNull()
  expect(labels.get(lost.id)).toBeNull()
  const [batch] = rowsOf<{ total: number; labelled: number }>(
    await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE version_label = 'Structured lesson name · v1.0.1')::int AS labelled
      FROM messages WHERE body = ${batchBody}
  `),
  )
  expect(batch).toEqual({ total: 501, labelled: 501 })
})
