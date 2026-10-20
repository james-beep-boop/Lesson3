/**
 * GET /api/server-time over the WIRE (2026-10-19): Site-Admin-only, fresh, uncached.
 * Every custom endpoint ships with its 401/403 + happy path (CLAUDE.md).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures'
import { login, url } from '../helpers/httpWire'

let fx: RoleFixture
const tokens: Partial<Record<RoleKey, string>> = {}
const get = (as?: RoleKey) =>
  fetch(url('/api/server-time'), { headers: as ? { Authorization: `JWT ${tokens[as]}` } : {} })

beforeAll(async () => {
  fx = await setupRoleFixture()
  for (const key of ['siteAdmin', 'subjectAdmin', 'editor', 'teacher'] as RoleKey[]) {
    tokens[key] = await login(fx.users[key].email, fx.password)
  }
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('GET /api/server-time', () => {
  it('401 without authentication', async () => {
    expect((await get()).status).toBe(401)
  })

  it.each(['subjectAdmin', 'editor', 'teacher'] as RoleKey[])('403 for %s', async (role) => {
    expect((await get(role)).status).toBe(403)
  })

  it('gives a Site Administrator the server clock, uncached', async () => {
    const before = Date.now()
    const response = await get('siteAdmin')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { now } = (await response.json()) as { now: number }
    // Same host clock in the test stack: within a few minutes of this runner's own reading.
    expect(Math.abs(now - before)).toBeLessThan(5 * 60_000)
  })
})
