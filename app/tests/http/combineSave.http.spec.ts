/** Phase 3a: second-parent provenance is server-owned, gated and saved atomically. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import {
  createUserVerified,
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'
import { recoveryRow } from '../helpers/editRecovery'
import { drizzleOf } from '../helpers/db'
import { login, url } from '../helpers/httpWire'
import { stillPendingAfterWindow, whileRowLocked } from '../helpers/rowLocks'
import type { LessonBundleVersion } from '../../src/payload-types'

let fx: RoleFixture
let parent: LessonBundleVersion
let sequence = 0
const tokens: Partial<Record<RoleKey, string>> = {}
beforeAll(async () => {
  fx = await setupRoleFixture()
  for (const key of ['siteAdmin', 'subjectAdmin', 'editor', 'teacher'] as RoleKey[]) {
    tokens[key] = await login(fx.users[key].email, fx.password)
  }
  parent = await version()
}, 120_000)
afterAll(async () => {
  await fx?.teardown()
})

async function version(planId = fx.plan.id, source = fx.version.id) {
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      title: `${MARK}Combine`,
      semver: `42.${++sequence}.0`,
      lessonPlan: planId,
      subjectGrade: fx.subjectGrade.id,
      sourceVersion: source,
      ...minimalBundleContent(),
    } as never,
  })
}
function form(second: unknown = parent.id, extra: Record<string, unknown> = {}) {
  const body = new FormData()
  body.set(
    'data',
    JSON.stringify({
      ...fx.version,
      ...extra,
      lessons: fx.version.lessons!.map((l) => ({
        ...l,
        overview: `${MARK}combined text ${++sequence}`,
      })),
    }),
  )
  if (second !== undefined) body.set('mergeParent', String(second))
  return body
}
const save = (body: FormData, jwt?: string, query = '', sourceId = fx.version.id) =>
  fetch(url(`/api/lesson-bundle-versions/${sourceId}/save-as-new${query}`), {
    method: 'POST',
    headers: jwt ? { Authorization: `JWT ${jwt}` } : {},
    body,
  })
const count = async () =>
  (
    await fx.payload.count({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      where: { lessonPlan: { equals: fx.plan.id } },
    })
  ).totalDocs

describe('Combine save gate', () => {
  it('401 without authentication and 403 without editing access', async () => {
    const before = await count()
    for (const [jwt, status] of [
      [undefined, 401],
      [tokens.teacher, 403],
    ] as const) {
      const res = await save(form(), jwt)
      expect(res.status).toBe(status)
      expect(await res.json()).not.toHaveProperty('unavailable')
    }
    expect(await count()).toBe(before)
  })
  it('404 for a missing second parent', async () => {
    const res = await save(form(999_999_999), tokens.editor)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      errors: [{ message: 'Version not found' }],
      unavailable: 'secondParent',
    })
  })
  it('identifies an unavailable source first, including when both parents are gone', async () => {
    for (const second of [parent.id, 999_999_999]) {
      const res = await save(form(second), tokens.editor, '', 999_999_998)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({
        errors: [{ message: 'Version not found' }],
        unavailable: 'source',
      })
    }
  })
  it.each(['bad', '99999999999', '0'])('400 for malformed parent %j', async (id) => {
    expect((await save(form(id), tokens.editor)).status).toBe(400)
  })
  it('treats an empty mergeParent as an ordinary save', async () => {
    const res = await save(form(''), tokens.editor)
    expect(res.status, await res.clone().text()).toBe(200)
    const { id } = (await res.json()) as { id: number }
    const saved = await fx.payload.findByID({ collection: 'lesson-bundle-versions', id, depth: 0 })
    expect(saved.mergedFrom).toBeNull()
    expect(saved.sourceVersion).toBe(fx.version.id)
    expect(saved.lineage).toEqual([fx.version.id])
  })
  it('400 for duplicate inputs or the source itself', async () => {
    const body = form()
    body.append('mergeParent', String(parent.id))
    expect((await save(body, tokens.editor)).status).toBe(400)
    expect((await save(form(fx.version.id), tokens.editor)).status).toBe(400)
  })
  it('400 for a parent from another plan, even when readable and editable', async () => {
    const plan = await fx.payload.create({
      collection: 'lesson-plans',
      overrideAccess: true,
      data: { title: `${MARK}other combine plan`, subjectGrade: fx.subjectGrade.id },
    })
    const other = await fx.payload.create({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      data: {
        title: `${MARK}other`,
        lessonPlan: plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.0',
        ...minimalBundleContent(),
      } as never,
    })
    const res = await save(form(other.id), tokens.editor)
    expect(res.status).toBe(400)
    expect(await res.json()).not.toHaveProperty('unavailable')
  })
  it('stale source timestamps return 409 without unavailable', async () => {
    const res = await save(
      form(parent.id, { updatedAt: '2000-01-01T00:00:00.000Z' }),
      tokens.editor,
    )
    expect(res.status).toBe(409)
    expect(await res.json()).not.toHaveProperty('unavailable')
  })
  it('rejects source deletion and keeps both parents without creating a version', async () => {
    const before = await count()
    const res = await save(form(), tokens.siteAdmin, '?deleteSource=true')
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('keeps both original versions')
    expect(await count()).toBe(before)
    expect(
      await fx.payload.findByID({ collection: 'lesson-bundle-versions', id: parent.id }),
    ).toBeTruthy()
    expect(
      await fx.payload.findByID({ collection: 'lesson-bundle-versions', id: fx.version.id }),
    ).toBeTruthy()
  })
})

describe('Combine save provenance', () => {
  it.each([
    ['Teacher with editing access', 'editor'],
    ['Subject-grade administrator', 'subjectAdmin'],
    ['Site administrator', 'siteAdmin'],
  ] as [string, RoleKey][])(
    'saves for %s with server-stamped lineage and neither parent deleted',
    async (_label, role) => {
      const res = await save(
        form(parent.id, { mergedFrom: 999, lineage: [999], sourceVersion: 999 }),
        tokens[role],
      )
      expect(res.status, await res.clone().text()).toBe(200)
      const out = (await res.json()) as { id: number; sourceDeleted: boolean }
      const saved = await fx.payload.findByID({
        collection: 'lesson-bundle-versions',
        id: out.id,
        depth: 0,
      })
      expect(saved.sourceVersion).toBe(fx.version.id)
      expect(saved.mergedFrom).toBe(parent.id)
      expect(saved.lineage).toEqual([fx.version.id, parent.id].sort((a, b) => a - b))
      expect(out.sourceDeleted).toBe(false)
      const plan = await fx.payload.findByID({
        collection: 'lesson-plans',
        id: fx.plan.id,
        depth: 0,
      })
      expect(plan.officialVersion).toBe(fx.version.id)
    },
  )
  it('does not mistake provenance-only changes for edited content', async () => {
    const body = new FormData()
    body.set('data', JSON.stringify({ ...fx.version, mergedFrom: parent.id, lineage: [parent.id] }))
    body.set('mergeParent', String(parent.id))
    const res = await save(body, tokens.editor)
    expect(res.status).toBe(400)
    expect(await res.json()).not.toHaveProperty('unavailable')
  })
  it('uses both-parent lineage after a parent is deleted', async () => {
    const a = await version()
    const b = await version()
    const combined = await fx.payload.create({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      data: {
        ...minimalBundleContent(),
        title: `${MARK}diamond`,
        semver: `43.${++sequence}.0`,
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        sourceVersion: a.id,
        mergedFrom: b.id,
      } as never,
    })
    await fx.payload.delete({
      collection: 'lesson-bundle-versions',
      id: a.id,
      overrideAccess: true,
    })
    const res = await fetch(
      url(`/api/lesson-bundle-versions/${combined.id}/combine-preview?with=${b.id}`),
      { headers: { Authorization: `JWT ${tokens.editor}` } },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ base: { id: b.id } })
    const saved = await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: combined.id,
      depth: 0,
    })
    expect(saved.sourceVersion).toBeNull()
    expect(saved.lineage).toContain(a.id)
    expect(saved.lineage).toContain(fx.version.id)
  })
  it('finds a surviving ancestor beyond a deleted common parent', async () => {
    const common = await version()
    const a = await version(fx.plan.id, common.id)
    const b = await version(fx.plan.id, common.id)
    await fx.payload.delete({
      collection: 'lesson-bundle-versions',
      id: common.id,
      overrideAccess: true,
    })
    const res = await fetch(
      url(`/api/lesson-bundle-versions/${a.id}/combine-preview?with=${b.id}`),
      { headers: { Authorization: `JWT ${tokens.editor}` } },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ base: { id: fx.version.id } })
  })
  it('selects the highest numeric version when both parents are common ancestors', async () => {
    const a = await version()
    const b = await version()
    const combine = (sourceVersion: number, mergedFrom: number) =>
      fx.payload.create({
        collection: 'lesson-bundle-versions',
        overrideAccess: true,
        data: {
          ...minimalBundleContent(),
          title: `${MARK}multiple ancestors`,
          semver: `44.${++sequence}.0`,
          lessonPlan: fx.plan.id,
          subjectGrade: fx.subjectGrade.id,
          sourceVersion,
          mergedFrom,
        } as never,
      })
    const x = await combine(a.id, b.id)
    const y = await combine(b.id, a.id)
    const res = await fetch(
      url(`/api/lesson-bundle-versions/${x.id}/combine-preview?with=${y.id}`),
      { headers: { Authorization: `JWT ${tokens.editor}` } },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ base: { id: b.id } })
  })
  it('rolls back the candidate and preserves the draft when retirement is stale', async () => {
    const start = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}/recovery/start`), {
      method: 'POST',
      headers: { Authorization: `JWT ${tokens.editor}` },
    })
    expect(start.status).toBe(200)
    const { token } = (await start.json()) as { token: { generation: number; revision: number } }
    const before = await recoveryRow(fx.payload, fx.version.id, fx.users.editor.id)
    const beforeCount = await count()
    const body = form()
    body.set('recoveryGeneration', String(token.generation))
    body.set('recoveryExpectedRevision', String(token.revision + 1))
    const res = await save(body, tokens.editor)
    expect(res.status).toBe(409)
    expect(await res.json()).not.toHaveProperty('unavailable')
    expect(await count()).toBe(beforeCount)
    expect(await recoveryRow(fx.payload, fx.version.id, fx.users.editor.id)).toEqual(before)
  })
  it('keeps Combine and ordinary saves available beyond the lineage window', async () => {
    const capped = await version()
    await fx.payload.update({
      collection: 'lesson-bundle-versions',
      id: capped.id,
      overrideAccess: true,
      data: {
        title: fx.version.title,
        lineage: Array.from({ length: 2000 }, (_, i) => 100_000 + i),
      },
    })
    const before = await count()
    const res = await save(form(capped.id), tokens.editor)
    expect(res.status, await res.clone().text()).toBe(200)
    const { id } = (await res.json()) as { id: number }
    const saved = await fx.payload.findByID({ collection: 'lesson-bundle-versions', id, depth: 0 })
    expect(saved.lineage).toEqual(Array.from({ length: 2000 }, (_, i) => 100_000 + i))
    const preview = await fetch(
      url(`/api/lesson-bundle-versions/${id}/combine-preview?with=${capped.id}`),
      {
        headers: { Authorization: `JWT ${tokens.editor}` },
      },
    )
    expect(preview.status).toBe(200)
    expect(await preview.json()).toMatchObject({
      base: null,
      plan: { ok: true, ancestry: 'two-way' },
    })
    const body = new FormData()
    body.set(
      'data',
      JSON.stringify({
        ...saved,
        lessons: saved.lessons!.map((l) => ({ ...l, overview: `${MARK}next ordinary save` })),
      }),
    )
    const next = await fetch(url(`/api/lesson-bundle-versions/${id}/save-as-new`), {
      method: 'POST',
      headers: { Authorization: `JWT ${tokens.editor}` },
      body,
    })
    expect(next.status, await next.clone().text()).toBe(200)
    expect(await count()).toBe(before + 2)
  })
  it('404 when the second parent disappears during the plan-lock wait', async () => {
    const deleted = await version()
    const before = await count()
    let pending!: Promise<Response>
    await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async () => {
      pending = save(form(deleted.id), tokens.editor)
      expect(await stillPendingAfterWindow(pending)).toBe(true)
      await drizzleOf(fx.payload).execute(
        sql`DELETE FROM lesson_bundle_versions WHERE id = ${deleted.id}`,
      )
    })
    const res = await pending
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ unavailable: 'secondParent' })
    expect(await count()).toBe(before - 1)
  }, 30_000)
  it.each([false, true])(
    'identifies the source after a lock wait (both deleted: %s)',
    async (both) => {
      const source = await version()
      const other = await version()
      const before = await count()
      const body = form(other.id)
      body.set(
        'data',
        JSON.stringify({
          ...source,
          lessons: source.lessons!.map((lesson) => ({
            ...lesson,
            overview: `${MARK}locked source save`,
          })),
        }),
      )
      let pending!: Promise<Response>
      await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async () => {
        pending = save(body, tokens.editor, '', source.id)
        expect(await stillPendingAfterWindow(pending)).toBe(true)
        await drizzleOf(fx.payload).execute(
          sql`DELETE FROM lesson_bundle_versions WHERE id = ${source.id}`,
        )
        if (both)
          await drizzleOf(fx.payload).execute(
            sql`DELETE FROM lesson_bundle_versions WHERE id = ${other.id}`,
          )
      })
      const res = await pending
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({
        errors: [{ message: 'Version not found' }],
        unavailable: 'source',
      })
      expect(await count()).toBe(before - (both ? 2 : 1))
    },
    30_000,
  )
  it('revoked editing access takes precedence over a source deleted during the lock wait', async () => {
    const user = await createUserVerified(fx.payload, {
      name: `${MARK}revoked source`,
      email: `${MARK}revoked-source@example.test`,
      password: fx.password,
      assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }],
    })
    const jwt = await login(user.email, fx.password)
    const source = await version()
    const body = form()
    body.set(
      'data',
      JSON.stringify({
        ...source,
        lessons: source.lessons!.map((lesson) => ({ ...lesson, overview: `${MARK}revoked save` })),
      }),
    )
    const before = await count()
    let pending!: Promise<Response>
    await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async () => {
      pending = save(body, jwt, '', source.id)
      expect(await stillPendingAfterWindow(pending)).toBe(true)
      await drizzleOf(fx.payload).execute(
        sql`DELETE FROM users_assignments WHERE _parent_id = ${user.id}`,
      )
      await drizzleOf(fx.payload).execute(
        sql`DELETE FROM lesson_bundle_versions WHERE id = ${source.id}`,
      )
    })
    const res = await pending
    expect(res.status).toBe(403)
    expect(await res.json()).not.toHaveProperty('unavailable')
    expect(await count()).toBe(before - 1)
  }, 30_000)
  it.each(['disabled', 'unverified', 'signed-out', 'revoked'])(
    '403 without a candidate when the caller is %s during a plan-lock wait',
    async (change) => {
      const user = await createUserVerified(fx.payload, {
        name: `${MARK}waiting`,
        email: `${MARK}waiting-${++sequence}@example.test`,
        password: fx.password,
        assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }],
      })
      const jwt = await login(user.email, fx.password)
      const before = await count()
      let pending!: Promise<Response>
      await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async () => {
        pending = save(form(), jwt)
        expect(await stillPendingAfterWindow(pending)).toBe(true)
        await drizzleOf(fx.payload).execute(
          change === 'signed-out'
            ? sql`DELETE FROM users_sessions WHERE _parent_id = ${user.id}`
            : change === 'disabled'
              ? sql`UPDATE users SET sign_in_disabled = true WHERE id = ${user.id}`
              : change === 'unverified'
                ? sql`UPDATE users SET _verified = false WHERE id = ${user.id}`
                : sql`DELETE FROM users_assignments WHERE _parent_id = ${user.id}`,
        )
      })
      expect((await pending).status).toBe(403)
      expect(await count()).toBe(before)
    },
    30_000,
  )
})

describe('ordinary save source checks under the plan lock', () => {
  const ordinaryForm = (source: LessonBundleVersion) => {
    const body = new FormData()
    body.set(
      'data',
      JSON.stringify({
        ...source,
        lessons: source.lessons!.map((lesson) => ({
          ...lesson,
          overview: `${MARK}ordinary save ${++sequence}`,
        })),
      }),
    )
    return body
  }

  it('saves normally after waiting when the source remains available', async () => {
    const source = await version()
    const body = ordinaryForm(source)
    const before = await count()
    let pending!: Promise<Response>
    await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async () => {
      pending = save(body, tokens.editor, '', source.id)
      expect(await stillPendingAfterWindow(pending)).toBe(true)
    })
    const res = await pending
    expect(res.status, await res.clone().text()).toBe(200)
    const result = (await res.json()) as { id: number; sourceDeleted: boolean }
    expect(result.sourceDeleted).toBe(false)
    const saved = await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: result.id,
      depth: 0,
    })
    expect(saved.sourceVersion).toBe(source.id)
    expect(saved.mergedFrom).toBeNull()
    expect(saved.lessons![0].overview).toBe(
      JSON.parse(String(body.get('data'))).lessons[0].overview,
    )
    expect(await count()).toBe(before + 1)
    const plan = await fx.payload.findByID({ collection: 'lesson-plans', id: fx.plan.id, depth: 0 })
    expect(plan.officialVersion).toBe(fx.version.id)
  }, 30_000)

  it.each([false, true])(
    'source deleted while waiting returns the expected error with no candidate (access revoked: %s)',
    async (revoked) => {
      const user = await createUserVerified(fx.payload, {
        name: `${MARK}ordinary waiting`,
        email: `${MARK}ordinary-waiting-${++sequence}@example.test`,
        password: fx.password,
        assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }],
      })
      const jwt = await login(user.email, fx.password)
      const source = await version()
      const body = ordinaryForm(source)
      const before = await count()
      let pending!: Promise<Response>
      await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async (tx) => {
        // Bound a regression's FK-lock wait; the helper still releases the plan lock in finally.
        await tx.execute(sql`SET LOCAL statement_timeout = '5s'`)
        pending = save(body, jwt, '', source.id)
        expect(await stillPendingAfterWindow(pending)).toBe(true)
        if (revoked)
          await tx.execute(sql`DELETE FROM users_assignments WHERE _parent_id = ${user.id}`)
        await tx.execute(sql`DELETE FROM lesson_bundle_versions WHERE id = ${source.id}`)
      })
      const res = await pending
      expect(res.status, await res.clone().text()).toBe(revoked ? 403 : 404)
      const result = await res.json()
      if (revoked) expect(result).not.toHaveProperty('unavailable')
      else
        expect(result).toEqual({
          errors: [{ message: 'Version not found' }],
          unavailable: 'source',
        })
      expect(await count()).toBe(before - 1)
      const plan = await fx.payload.findByID({
        collection: 'lesson-plans',
        id: fx.plan.id,
        depth: 0,
      })
      expect(plan.officialVersion).toBe(fx.version.id)
    },
    30_000,
  )
})
