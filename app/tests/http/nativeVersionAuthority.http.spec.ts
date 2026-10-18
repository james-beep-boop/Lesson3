import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '@payloadcms/db-postgres'
import {
  createUserVerified,
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures'
import { drizzleOf } from '../helpers/db'
import { stillPendingAfterWindow, whileRowLocked } from '../helpers/rowLocks'
import { login, url } from '../helpers/httpWire'

let fx: RoleFixture
let sequence = 0
beforeAll(async () => {
  fx = await setupRoleFixture()
}, 120_000)
afterAll(async () => {
  await fx?.teardown()
})

describe('native lesson mutations after a plan-lock wait', () => {
  for (const action of ['promote', 'delete'] as const) {
    it.each(['demoted', 'disabled', 'unverified', 'signed-out'])(
      `refuses ${action} by a caller %s while waiting`,
      async (change) => {
        const caller = await createUserVerified(fx.payload, {
          name: `${MARK}native caller`,
          email: `${MARK}native-${++sequence}@example.test`,
          password: fx.password,
          roles: ['siteAdmin'],
        })
        const jwt = await login(caller.email, fx.password)
        const version = await fx.payload.create({
          collection: 'lesson-bundle-versions',
          overrideAccess: true,
          data: {
            lessonPlan: fx.plan.id,
            subjectGrade: fx.subjectGrade.id,
            semver: `41.${++sequence}.0`,
            title: `${MARK}native candidate`,
            ...minimalBundleContent(),
          } as never,
        })
        const before = await fx.payload.findByID({
          collection: 'lesson-plans',
          id: fx.plan.id,
          overrideAccess: true,
          depth: 0,
        })
        let pending!: Promise<Response>
        await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async () => {
          pending = fetch(
            url(
              action === 'promote'
                ? `/api/lesson-plans/${fx.plan.id}`
                : `/api/lesson-bundle-versions/${version.id}`,
            ),
            {
              method: action === 'promote' ? 'PATCH' : 'DELETE',
              headers: { Authorization: `JWT ${jwt}`, 'Content-Type': 'application/json' },
              ...(action === 'promote'
                ? { body: JSON.stringify({ officialVersion: version.id }) }
                : {}),
            },
          )
          expect(await stillPendingAfterWindow(pending)).toBe(true)
          await drizzleOf(fx.payload).execute(
            change === 'demoted'
              ? sql`DELETE FROM users_roles WHERE parent_id = ${caller.id}`
              : change === 'disabled'
                ? sql`UPDATE users SET sign_in_disabled = true WHERE id = ${caller.id}`
                : change === 'signed-out'
                  ? sql`DELETE FROM users_sessions WHERE _parent_id = ${caller.id}`
                  : sql`UPDATE users SET _verified = false WHERE id = ${caller.id}`,
          )
        })
        expect((await pending).status).toBe(403)
        const after = await fx.payload.findByID({
          collection: 'lesson-plans',
          id: fx.plan.id,
          overrideAccess: true,
          depth: 0,
        })
        expect(after.officialVersion).toBe(before.officialVersion)
        expect(
          await fx.payload.findByID({
            collection: 'lesson-bundle-versions',
            id: version.id,
            overrideAccess: true,
          }),
        ).toBeTruthy()
      },
      30_000,
    )
  }
})
