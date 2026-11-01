/**
 * Wire-level guard for the short reset code (2026-11-01): `reveal-reset-link` mints it and the public
 * `POST /api/users/redeem-reset-code` trades email + code for the reset token.
 *
 * ⚑ THE STANDING GUARD `CLAUDE.md` REQUIRES. The redeem endpoint is UNAUTHENTICATED and writes with
 * raw SQL, so what keeps it safe is exactly what this file pins: every failure is the same 400 with
 * the same body (no account oracle), a code is single-use, a code dies after 5 wrong tries or when
 * it expires, a disabled account gets nothing, and a client is rate-limited. The 401/403/404 matrix
 * of `reveal-reset-link` itself lives in `userAdminActions.http.spec.ts`.
 *
 * HOW IT RUNS: like the rest of `tests/http`, against a running app at `E2E_BASE_URL`.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'

import { sql } from '@payloadcms/db-postgres'

import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { clearRateLimitBuckets, drizzleOf } from '../helpers/db.js'
import { login, url } from '../helpers/httpWire.js'
import { RESET_CODE_FAILURE } from '../../src/endpoints/resetCode.js'

const CODE_SHAPE = /^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/
const CLIENT_MAX = Number(process.env.RATE_LIMIT_RESET_CODE_CLIENT_MAX) || 30

let fx: RoleFixture
let adminToken = ''
let targetId = 0
const TARGET_EMAIL = `${MARK}reset-code-target@lesson3.local`.toLowerCase()

async function reveal(): Promise<{ code: string; codeExpiresInMinutes: unknown }> {
  const fresh = await fetch(url(`/api/users/${targetId}?depth=0`), {
    headers: { Authorization: `JWT ${adminToken}` },
  })
  const { updatedAt } = (await fresh.json()) as { updatedAt: string }
  const res = await fetch(url(`/api/users/${targetId}/reveal-reset-link`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${adminToken}` },
    body: JSON.stringify({ expectedUpdatedAt: updatedAt }),
  })
  expect(res.status).toBe(200)
  return (await res.json()) as { code: string; codeExpiresInMinutes: unknown }
}

async function redeem(
  email: string,
  code: string,
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const res = await fetch(url('/api/users/redeem-reset-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    headers: res.headers,
  }
}

const failureBody = { errors: [{ message: RESET_CODE_FAILURE }] }
/** A code-shaped value that is never the issued one (the alphabet has no 0 or 1, so neither is it). */
const wrongCodeFor = (code: string) => (code === '2222-2222' ? '3333-3333' : '2222-2222')

beforeAll(async () => {
  fx = await setupRoleFixture()
  adminToken = await login(fx.users.siteAdmin.email, fx.password)
  const target = await fx.payload.create({
    collection: 'users',
    data: {
      email: TARGET_EMAIL,
      password: fx.password,
      name: `${MARK}Reset Code Target`,
      _verified: true,
    } as never,
    overrideAccess: true,
  })
  targetId = target.id
}, 120_000)

beforeEach(async () => {
  // Every case starts with a fresh client budget, so no assertion depends on the order cases run in.
  await clearRateLimitBuckets(fx.payload, 'resetCodeClient:%')
})

afterAll(async () => {
  await clearRateLimitBuckets(fx.payload, 'resetCodeClient:%').catch(() => undefined)
  if (targetId) {
    await fx?.payload
      .delete({ collection: 'users', id: targetId, overrideAccess: true })
      .catch(() => undefined)
  }
  await fx?.teardown()
})

describe('POST /api/users/redeem-reset-code', () => {
  it('reveal-reset-link returns a readable code and its lifetime', async () => {
    const { code, codeExpiresInMinutes } = await reveal()
    expect(code).toMatch(CODE_SHAPE)
    expect(codeExpiresInMinutes).toBe(15)
  })

  it('a correct code, typed loosely, returns a token the reset page accepts — once', async () => {
    const { code } = await reveal()
    // Lower case, no dash, stray spaces, and the email in a different case: all forgiven.
    const typed = ` ${code.replace('-', '').toLowerCase()} `
    const ok = await redeem(TARGET_EMAIL.toUpperCase(), typed)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(typeof ok.body.token).toBe('string')

    // The token is the real one: Payload's own reset accepts it.
    const reset = await fetch(url('/api/users/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ok.body.token, password: fx.password }),
    })
    expect(reset.status).toBe(200)

    // Single use: the same code again is the uniform failure.
    const again = await redeem(TARGET_EMAIL, code)
    expect(again.status).toBe(400)
    expect(again.body).toEqual(failureBody)
  })

  it('an unknown address and a wrong code give byte-identical answers', async () => {
    const { code } = await reveal()
    const unknown = await redeem(`${MARK}nobody@lesson3.local`, code)
    const wrong = await redeem(TARGET_EMAIL, wrongCodeFor(code))
    const garbage = await redeem(TARGET_EMAIL, 'not a code at all')
    for (const r of [unknown, wrong, garbage]) {
      expect(r.status).toBe(400)
      expect(r.body).toEqual(failureBody)
      expect(r.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('a code stops working after 5 wrong tries, even when the right code follows', async () => {
    const { code } = await reveal()
    for (let i = 0; i < 5; i++) {
      expect((await redeem(TARGET_EMAIL, wrongCodeFor(code))).status).toBe(400)
    }
    const right = await redeem(TARGET_EMAIL, code)
    expect(right.status).toBe(400)
    expect(right.body).toEqual(failureBody)
  })

  it('a new reveal replaces the old code and resets the tries', async () => {
    const first = await reveal()
    for (let i = 0; i < 4; i++) await redeem(TARGET_EMAIL, wrongCodeFor(first.code))
    const second = await reveal()
    expect((await redeem(TARGET_EMAIL, first.code)).status).toBe(400)
    expect((await redeem(TARGET_EMAIL, second.code)).status).toBe(200)
  })

  it('an expired code is refused', async () => {
    const { code } = await reveal()
    await drizzleOf(fx.payload).execute(
      sql`UPDATE "users" SET "reset_code_expires_at" = now() - interval '1 minute' WHERE "id" = ${targetId};`,
    )
    expect((await redeem(TARGET_EMAIL, code)).body).toEqual(failureBody)
  })

  it('a disabled account gets nothing, even with the right code', async () => {
    const { code } = await reveal()
    await drizzleOf(fx.payload).execute(
      sql`UPDATE "users" SET "sign_in_disabled" = true WHERE "id" = ${targetId};`,
    )
    try {
      expect((await redeem(TARGET_EMAIL, code)).body).toEqual(failureBody)
    } finally {
      await drizzleOf(fx.payload).execute(
        sql`UPDATE "users" SET "sign_in_disabled" = false WHERE "id" = ${targetId};`,
      )
    }
  })

  it('400 for a missing field, without touching any account', async () => {
    const res = await fetch(url('/api/users/redeem-reset-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TARGET_EMAIL }),
    })
    expect(res.status).toBe(400)
  })

  it(`429 once a client has made ${CLIENT_MAX} tries in the window`, async () => {
    for (let i = 0; i < CLIENT_MAX; i++) {
      expect((await redeem(`${MARK}nobody@lesson3.local`, '2222-2222')).status).toBe(400)
    }
    const blocked = await redeem(`${MARK}nobody@lesson3.local`, '2222-2222')
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  }, 60_000)
})
