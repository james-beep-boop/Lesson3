/**
 * The server's own error messages must survive the PRODUCTION BUNDLE, over the wire.
 *
 * Found 2026-10-08: the Next.js 16.4.0 production build emitted Payload's error classes anonymously, so every
 * thrown `APIError` serialised as `{ errors: [{ message: 'An unknown error occurred.' }] }` and the Manage
 * page lost its guard messages. Nothing at the Local-API or unit level can see this — only the built app.
 * `src/lib/restoreErrorClassNames.ts` is the fix; these tests are why a regression would not ship.
 *
 * HOW IT RUNS: same as `endpoints.http.spec.ts` (running production-mode app; `E2E_BASE_URL`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'

const UNKNOWN = 'An unknown error occurred.'

let fx: RoleFixture
let admin: string
let teacher: string

const messageOf = async (res: Response): Promise<string> =>
  ((await res.json()) as { errors?: { message?: string }[] }).errors?.[0]?.message ?? ''

beforeAll(async () => {
  fx = await setupRoleFixture()
  admin = await login(fx.users.siteAdmin.email, fx.password)
  teacher = await login(fx.users.teacher.email, fx.password)
}, 120_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('server error messages reach the client from the built app', () => {
  it("a guard's own 409 message: deleting a subject grade that still has lesson plans", async () => {
    const res = await fetch(url(`/api/subject-grades/${fx.subjectGrade.id}`), {
      method: 'DELETE',
      headers: { Authorization: `JWT ${admin}` },
    })
    expect(res.status).toBe(409)
    const message = await messageOf(res)
    expect(message).not.toBe(UNKNOWN)
    expect(message).toContain('still use this subject grade')
  })

  it('a 403 states why instead of "unknown"', async () => {
    const res = await fetch(url(`/api/subject-grades/${fx.subjectGrade.id}`), {
      method: 'DELETE',
      headers: { Authorization: `JWT ${teacher}` },
    })
    expect(res.status).toBe(403)
    const message = await messageOf(res)
    expect(message).not.toBe(UNKNOWN)
    expect(message.length).toBeGreaterThan(0)
  })

  it('a 404 states what was not found instead of "unknown"', async () => {
    const res = await fetch(url('/api/lesson-plans/2147483000'), {
      headers: { Authorization: `JWT ${admin}` },
    })
    expect(res.status).toBe(404)
    const message = await messageOf(res)
    expect(message).not.toBe(UNKNOWN)
    expect(message.length).toBeGreaterThan(0)
  })
})
