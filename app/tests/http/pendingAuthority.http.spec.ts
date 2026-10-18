/** Permission revocation while native user writes and version actions wait on real DB locks. */
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
import { recoveryRow } from '../helpers/editRecovery'
import { stillPendingAfterWindow, whileLockHeld, whileRowLocked } from '../helpers/rowLocks'
import { login, url } from '../helpers/httpWire'
import { ADVISORY_LOCKS } from '../../src/lib/txDb'

let fx: RoleFixture
let sequence = 0
beforeAll(async () => {
  fx = await setupRoleFixture()
}, 120_000)
afterAll(async () => {
  await fx?.teardown()
})

async function caller() {
  const user = await createUserVerified(fx.payload, {
    name: `${MARK}pending caller`,
    email: `${MARK}pending-${++sequence}@example.test`,
    password: fx.password,
    roles: ['siteAdmin'],
    assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }],
  })
  return { user, jwt: await login(user.email, fx.password) }
}
const headers = (jwt: string) => ({ Authorization: `JWT ${jwt}` })
const jsonHeaders = (jwt: string) => ({ ...headers(jwt), 'Content-Type': 'application/json' })
const revoke = async (id: number, change: string) => {
  if (change === 'signed-out') {
    await drizzleOf(fx.payload).execute(sql`DELETE FROM users_sessions WHERE _parent_id = ${id}`)
    return
  }
  await drizzleOf(fx.payload).execute(
    change === 'demoted'
      ? sql`DELETE FROM users_roles WHERE parent_id = ${id}`
      : change === 'disabled'
        ? sql`UPDATE users SET sign_in_disabled = true WHERE id = ${id}`
        : sql`UPDATE users SET _verified = false WHERE id = ${id}`,
  )
}
async function source(author: number) {
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: `31.${++sequence}.0`,
      title: `${MARK}pending version`,
      author,
      ...minimalBundleContent(),
    } as never,
  })
}
const versionCount = () =>
  fx.payload.count({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    where: { lessonPlan: { equals: fx.plan.id } },
  })

describe('native user PATCH after a lock wait', () => {
  it('still permits a Teacher to update their own display name', async () => {
    const jwt = await login(fx.users.teacher.email, fx.password)
    const res = await fetch(url(`/api/users/${fx.users.teacher.id}`), {
      method: 'PATCH',
      headers: jsonHeaders(jwt),
      body: JSON.stringify({ name: `${MARK}updated Teacher` }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ doc: { name: `${MARK}updated Teacher` } })
  })

  it.each(['demoted', 'disabled', 'unverified', 'signed-out'])(
    'refuses a caller %s while granting Site Administrator',
    async (change) => {
      const { user, jwt } = await caller()
      const target = await createUserVerified(fx.payload, {
        name: `${MARK}pending target`,
        email: `${MARK}target-${++sequence}@example.test`,
        password: fx.password,
      })
      const { classifier, key } = ADVISORY_LOCKS.adminCount
      let pending!: Promise<Response>
      await whileLockHeld(
        fx.payload,
        sql`SELECT pg_advisory_xact_lock(${classifier}, ${key})`,
        async () => {
          pending = fetch(url(`/api/users/${target.id}`), {
            method: 'PATCH',
            headers: jsonHeaders(jwt),
            body: JSON.stringify({ roles: ['siteAdmin'] }),
          })
          expect(await stillPendingAfterWindow(pending)).toBe(true)
          await revoke(user.id, change)
        },
      )
      expect((await pending).status).toBe(403)
      const after = await fx.payload.findByID({
        collection: 'users',
        id: target.id,
        overrideAccess: true,
      })
      expect(after.roles ?? []).toEqual([])
      expect(after.updatedAt).toBe(target.updatedAt)
    },
    30_000,
  )
})

describe('native user DELETE after a row-lock wait', () => {
  it.each(['demoted', 'disabled', 'unverified', 'signed-out'])(
    'refuses a caller %s while deleting an account',
    async (change) => {
      const { user, jwt } = await caller()
      const target = await createUserVerified(fx.payload, {
        name: `${MARK}delete target`,
        email: `${MARK}delete-${++sequence}@example.test`,
        password: fx.password,
      })
      let pending!: Promise<Response>
      await whileRowLocked(fx.payload, 'users', target.id, async () => {
        pending = fetch(url(`/api/users/${target.id}`), { method: 'DELETE', headers: headers(jwt) })
        expect(await stillPendingAfterWindow(pending)).toBe(true)
        await revoke(user.id, change)
      })
      expect((await pending).status).toBe(403)
      expect(
        await fx.payload.findByID({ collection: 'users', id: target.id, overrideAccess: true }),
      ).toMatchObject({ updatedAt: target.updatedAt })
    },
    30_000,
  )
})

describe('version authority after a lock wait', () => {
  it.each([true, false])(
    'respects source-deletion scope after demotion (owns source: %s)',
    async (ownsSource) => {
      const { user, jwt } = await caller()
      const version = await source(ownsSource ? user.id : fx.users.teacher.id)
      const res = await fetch(url(`/api/lesson-bundle-versions/${version.id}/recovery/start`), {
        method: 'POST',
        headers: headers(jwt),
      })
      expect(res.status).toBe(200)
      const { token } = (await res.json()) as { token: { generation: number; revision: number } }
      const before = await recoveryRow(fx.payload, version.id, user.id)
      const count = await versionCount()
      const form = new FormData()
      form.set(
        'data',
        JSON.stringify({
          ...version,
          lessons: version.lessons?.map((l) => ({ ...l, overview: 'Permitted prose edit.' })),
        }),
      )
      form.set('recoveryGeneration', String(token.generation))
      form.set('recoveryExpectedRevision', String(token.revision))
      let pending!: Promise<Response>
      await whileLockHeld(
        fx.payload,
        sql`SELECT id FROM edit_recovery WHERE user_id = ${user.id} AND source_version_id = ${version.id} FOR UPDATE`,
        async () => {
          pending = fetch(
            url(`/api/lesson-bundle-versions/${version.id}/save-as-new?deleteSource=true`),
            { method: 'POST', headers: headers(jwt), body: form },
          )
          expect(await stillPendingAfterWindow(pending)).toBe(true)
          await revoke(user.id, 'demoted')
        },
      )
      const saved = await pending
      if (!ownsSource) {
        expect(saved.status).toBe(403)
        expect(await versionCount()).toEqual(count)
        expect(await recoveryRow(fx.payload, version.id, user.id)).toEqual(before)
        expect(
          await fx.payload.findByID({
            collection: 'lesson-bundle-versions',
            id: version.id,
            overrideAccess: true,
          }),
        ).toBeTruthy()
        return
      }
      expect(saved.status).toBe(200)
      const out = (await saved.json()) as { id: number; sourceDeleted: boolean }
      expect(out.sourceDeleted).toBe(true)
      expect(
        await fx.payload.findByID({
          collection: 'lesson-bundle-versions',
          id: out.id,
          overrideAccess: true,
        }),
      ).toMatchObject({ lessons: [{ overview: 'Permitted prose edit.' }] })
    },
    30_000,
  )

  it.each(['demoted', 'disabled', 'unverified', 'signed-out'])(
    'rolls back an administrator save when the caller is %s during retirement',
    async (change) => {
      const { user, jwt } = await caller()
      const version = await source(user.id)
      const started = await fetch(url(`/api/lesson-bundle-versions/${version.id}/recovery/start`), {
        method: 'POST',
        headers: headers(jwt),
      })
      expect(started.status).toBe(200)
      const { token } = (await started.json()) as {
        token: { generation: number; revision: number }
      }
      const draft = await fetch(url(`/api/lesson-bundle-versions/${version.id}/recovery`), {
        method: 'POST',
        headers: jsonHeaders(jwt),
        body: JSON.stringify({
          generation: token.generation,
          expectedRevision: token.revision,
          document: version,
        }),
      })
      expect(draft.status).toBe(200)
      const captured = (await draft.json()) as { token: { generation: number; revision: number } }
      const before = await recoveryRow(fx.payload, version.id, user.id)
      const count = await versionCount()
      const form = new FormData()
      form.set(
        'data',
        JSON.stringify({
          ...version,
          lessons: version.lessons?.map((l) => ({
            ...l,
            duration: '80 min',
            overview: 'New wording.',
          })),
        }),
      )
      form.set('recoveryGeneration', String(captured.token.generation))
      form.set('recoveryExpectedRevision', String(captured.token.revision))
      let pending!: Promise<Response>
      await whileLockHeld(
        fx.payload,
        sql`SELECT id FROM edit_recovery WHERE user_id = ${user.id} AND source_version_id = ${version.id} FOR UPDATE`,
        async () => {
          pending = fetch(
            url(`/api/lesson-bundle-versions/${version.id}/save-as-new?deleteSource=true`),
            { method: 'POST', headers: headers(jwt), body: form },
          )
          expect(await stillPendingAfterWindow(pending)).toBe(true)
          await revoke(user.id, change)
        },
      )
      expect((await pending).status).toBe(403)
      expect(await versionCount()).toEqual(count)
      expect(await recoveryRow(fx.payload, version.id, user.id)).toEqual(before)
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

  it.each(['demoted', 'disabled', 'unverified', 'signed-out'])(
    'rolls back Make Official when the caller is %s while waiting for the plan',
    async (change) => {
      const { user, jwt } = await caller()
      const version = await source(user.id)
      const before = await fx.payload.findByID({
        collection: 'lesson-plans',
        id: fx.plan.id,
        overrideAccess: true,
        depth: 0,
      })
      let pending!: Promise<Response>
      await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async () => {
        pending = fetch(url(`/api/lesson-bundle-versions/${version.id}/make-official`), {
          method: 'POST',
          headers: headers(jwt),
        })
        expect(await stillPendingAfterWindow(pending)).toBe(true)
        await revoke(user.id, change)
      })
      expect((await pending).status).toBe(403)
      const after = await fx.payload.findByID({
        collection: 'lesson-plans',
        id: fx.plan.id,
        overrideAccess: true,
        depth: 0,
      })
      expect(after.officialVersion).toBe(before.officialVersion)
    },
    30_000,
  )
})
