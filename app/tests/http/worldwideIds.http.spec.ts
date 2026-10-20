/**
 * Worldwide identity over the WIRE, against the schema the real migrations built (2026-10-19).
 *
 *   - the database itself refuses a missing or duplicate uid (NOT NULL + UNIQUE from the migration);
 *   - a person's uid is read like their email: themselves and Site Administrators only;
 *   - a version's uid is readable by anyone who can read the version;
 *   - no API write can set or change a uid;
 *   - a teacher's save from an ARES release gets its own uid and no release fingerprint.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import { MARK, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures'
import { drizzleOf } from '../helpers/db'
import { login, url } from '../helpers/httpWire'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
let fx: RoleFixture
const tokens: Partial<Record<RoleKey, string>> = {}
const get = (path: string, as?: RoleKey) =>
  fetch(url(path), { headers: as ? { Authorization: `JWT ${tokens[as]}` } : {} })

beforeAll(async () => {
  fx = await setupRoleFixture()
  for (const key of ['siteAdmin', 'subjectAdmin', 'editor', 'teacher'] as RoleKey[]) {
    tokens[key] = await login(fx.users[key].email, fx.password)
  }
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('the database enforces worldwide ids', () => {
  it('refuses a missing uid and a duplicate uid', async () => {
    const db = drizzleOf(fx.payload)
    await expect(
      db.execute(sql`UPDATE lesson_plans SET uid = NULL WHERE id = ${fx.plan.id}`),
    ).rejects.toThrow()
    const other = (
      await fx.payload.findByID({
        collection: 'users',
        id: fx.users.teacher.id,
        overrideAccess: true,
      })
    ).uid
    await expect(
      db.execute(sql`UPDATE users SET uid = ${other} WHERE id = ${fx.users.editor.id}`),
    ).rejects.toThrow()
  })
})

describe('who can read a person’s worldwide id', () => {
  it('the person and Site Administrators — no one else', async () => {
    const path = `/api/users/${fx.users.teacher.id}`
    const own = (await (await get(path, 'teacher')).json()) as { uid?: string }
    expect(own.uid).toMatch(UUID)
    const admin = (await (await get(path, 'siteAdmin')).json()) as { uid?: string }
    expect(admin.uid).toBe(own.uid)
    for (const role of ['subjectAdmin', 'editor'] as RoleKey[]) {
      const response = await get(path, role)
      if (response.ok) expect(((await response.json()) as { uid?: string }).uid).toBeUndefined()
      else expect([403, 404]).toContain(response.status)
    }
    // The directory: the caller may see only their OWN uid (read like email: self or Site Admin).
    const list = (await (await get('/api/users?limit=100', 'editor')).json()) as {
      docs?: { id: number; uid?: string }[]
    }
    expect(list.docs?.length).toBeGreaterThan(1)
    for (const doc of list.docs ?? []) {
      if (doc.id === fx.users.editor.id) expect(doc.uid, 'own uid').toMatch(UUID)
      else expect(doc.uid, `user ${doc.id} uid visible to another user`).toBeUndefined()
    }
  })

  it('a version’s uid is readable by anyone who can read the version', async () => {
    const body = (await (
      await get(`/api/lesson-bundle-versions/${fx.version.id}`, 'teacher')
    ).json()) as {
      uid?: string
    }
    expect(body.uid).toMatch(UUID)
  })
})

describe('no API write sets or changes a uid', () => {
  it('a Site Administrator’s PATCH cannot change a person’s uid', async () => {
    const before = (
      await fx.payload.findByID({
        collection: 'users',
        id: fx.users.teacher.id,
        overrideAccess: true,
      })
    ).uid
    const response = await fetch(url(`/api/users/${fx.users.teacher.id}`), {
      method: 'PATCH',
      headers: { Authorization: `JWT ${tokens.siteAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: '00000000-0000-4000-8000-000000000000' }),
    })
    expect(response.status).toBeLessThan(500)
    const after = (
      await fx.payload.findByID({
        collection: 'users',
        id: fx.users.teacher.id,
        overrideAccess: true,
      })
    ).uid
    expect(after).toBe(before)
  })
})

describe('a teacher’s save from an ARES release', () => {
  it('gets a fresh uid and never inherits the release fingerprint', async () => {
    const fingerprint = `ares-content-v1:sha256:${'a'.repeat(64)}`
    // Make the fixture's source version an ARES release, as ingest would have stamped it.
    await drizzleOf(fx.payload).execute(
      sql`UPDATE lesson_bundle_versions SET release_fingerprint = ${fingerprint} WHERE id = ${fx.version.id}`,
    )
    const source = await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: fx.version.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(source.releaseFingerprint).toBe(fingerprint)
    const body = new FormData()
    // The full source document, identity included — exactly what an editor form round-trips.
    body.set(
      'data',
      JSON.stringify({
        ...source,
        lessons: source.lessons!.map((lesson) => ({ ...lesson, overview: `${MARK}identity edit` })),
      }),
    )
    const response = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}/save-as-new`), {
      method: 'POST',
      headers: { Authorization: `JWT ${tokens.editor}` },
      body,
    })
    expect(response.status).toBe(200)
    const { adminUrl } = (await response.json()) as { adminUrl: string }
    const created = await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: Number(adminUrl.split('/').pop()),
      depth: 0,
      overrideAccess: true,
    })
    expect(created.uid).toMatch(UUID)
    expect(created.uid).not.toBe(source.uid)
    expect(created.releaseFingerprint ?? null).toBeNull()
  })
})
