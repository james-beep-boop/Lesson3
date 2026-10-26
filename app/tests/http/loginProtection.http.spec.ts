import { createHash, pbkdf2Sync } from 'node:crypto'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '@payloadcms/db-postgres'
import { clearRateLimitBuckets, drizzleOf } from '../helpers/db'
import { MARK, createUserVerified, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { HTTP_BASE } from '../helpers/httpWire'

// docker-compose.test.yml trusts the Docker runner as a synthetic proxy on app; pdf-private trusts
// no proxy. These addresses are synthetic clients, not an exemption from the production rate limits.
const A = '198.18.0.11'
const B = '198.18.0.12'
let fx: RoleFixture
const key = (ip: string) => createHash('sha256').update(ip).digest('hex')
const send = (email: string, password: string, client = A, base = HTTP_BASE) =>
  fetch(`${base}/api/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': client,
      'x-lesson3-login-request': 'forged',
    },
    body: JSON.stringify({ email, password }),
  })
beforeAll(async () => {
  fx = await setupRoleFixture()
})
afterAll(async () => {
  await fx?.teardown()
})
beforeEach(async () => {
  for (const client of [A, B]) {
    await clearRateLimitBuckets(fx.payload, `loginClient:${key(client)}`)
    await clearRateLimitBuckets(fx.payload, `login:${key(client)}:%`)
  }
})

describe('sign-in abuse controls over HTTP', () => {
  it('accepts the native Payload admin form as well as JSON login requests', async () => {
    const body = new FormData()
    body.set('_payload', JSON.stringify({ email: fx.users.siteAdmin.email, password: fx.password }))
    const response = await fetch(`${HTTP_BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'x-forwarded-for': A },
      body,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('payload-token=')
    expect((await response.json()).user.id).toBe(fx.users.siteAdmin.id)
  })
  it('returns a real cookie/token and authenticates the resulting session', async () => {
    const r = await send(fx.users.teacher.email, fx.password)
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toContain('payload-token=')
    expect(r.headers.get('cache-control')).toBe('no-store')
    const { token } = await r.json()
    const me = await fetch(`${HTTP_BASE}/api/users/me`, {
      headers: { Authorization: `JWT ${token}` },
    })
    expect((await me.json()).user.id).toBe(fx.users.teacher.id)
  })
  it('unknown addresses and wrong passwords have the same generic failure, including the sixth attempt', async () => {
    for (let i = 0; i < 6; i++) {
      const known = await send(fx.users.teacher.email, 'wrong-password')
      const unknown = await send(`${MARK}unknown-${i}@example.test`, 'wrong-password')
      expect(known.status).toBe(401)
      expect(unknown.status).toBe(401)
      expect(await known.json()).toEqual(await unknown.json())
    }
    expect((await send(fx.users.teacher.email, fx.password)).status).toBe(200)
  })
  it('one client exhausting a victim budget cannot lock that account for another client', async () => {
    for (let i = 0; i < (Number(process.env.RATE_LIMIT_LOGIN_MAX) || 20); i++) {
      expect((await send(fx.users.teacher.email, 'wrong-password')).status).toBe(401)
    }
    expect((await send(fx.users.teacher.email, fx.password)).status).toBe(429)
    expect((await send(fx.users.teacher.email, fx.password, B)).status).toBe(200)
    const user = await fx.payload.findByID({
      collection: 'users',
      id: fx.users.teacher.id,
      showHiddenFields: true,
      overrideAccess: true,
    })
    expect(user.loginAttempts).toBe(0)
    expect(user.lockUntil).toBeNull()
  })
  it('distinct requested addresses cannot spend another client’s aggregate sign-in capacity', async () => {
    const max = Number(process.env.RATE_LIMIT_LOGIN_CLIENT_MAX) || 60
    for (let i = 0; i < 3; i++) {
      expect((await send(`${MARK}absent-${i}@example.test`, 'wrong-password')).status).toBe(401)
    }
    // Fill the remainder in the current window rather than race a minute boundary during 60 hashes.
    await drizzleOf(fx.payload).execute(sql`
      UPDATE rate_limit_counters SET count=${max}, window_start=${Math.floor(Date.now() / 60_000) * 60_000}
      WHERE bucket_key=${`loginClient:${key(A)}`}`)
    expect((await send(fx.users.teacher.email, fx.password)).status).toBe(429)
    expect((await send(fx.users.siteAdmin.email, fx.password, B)).status).toBe(200)
  }, 60_000)
  it('forged forwarding prefixes and internal tokens do not evade a client limit', async () => {
    await drizzleOf(fx.payload).execute(sql`
      INSERT INTO rate_limit_counters (bucket_key, window_start, count)
      VALUES (${`loginClient:${key(A)}`}, ${Math.floor(Date.now() / 60_000) * 60_000}, 100000)
      ON CONFLICT (bucket_key) DO UPDATE SET window_start=EXCLUDED.window_start, count=EXCLUDED.count`)
    expect((await send(fx.users.teacher.email, fx.password, `${B}, ${A}`)).status).toBe(429)
    expect((await send(fx.users.teacher.email, fx.password, B)).status).toBe(200)
  })
  it('untrusted direct clients cannot select a new identity with forwarding headers', async () => {
    const direct = 'http://pdf-private:3000'
    const max = Number(process.env.RATE_LIMIT_LOGIN_MAX) || 20
    for (let i = 0; i < max; i++) {
      expect(
        (await send(fx.users.teacher.email, 'wrong-password', `203.0.113.${i + 1}`, direct)).status,
      ).toBe(401)
    }
    expect((await send(fx.users.teacher.email, fx.password, '203.0.113.250', direct)).status).toBe(
      429,
    )
  })
  it('legacy locks no longer reject a correct password or disclose a distinct wrong-password response', async () => {
    await fx.payload.db.updateOne({
      collection: 'users',
      id: fx.users.teacher.id,
      data: { loginAttempts: 5, lockUntil: new Date(Date.now() + 600_000).toISOString() },
    })
    const wrong = await send(fx.users.teacher.email, 'wrong-password')
    expect(wrong.status).toBe(401)
    expect(JSON.stringify(await wrong.json())).not.toMatch(/locked/i)
    expect((await send(fx.users.teacher.email, fx.password)).status).toBe(200)
  })
  it('legacy password hashes still authenticate and upgrade through Payload', async () => {
    const salt = 'legacy-fixture-salt'
    await fx.payload.db.updateOne({
      collection: 'users',
      id: fx.users.teacher.id,
      data: { salt, hash: pbkdf2Sync(fx.password, salt, 25_000, 512, 'sha256').toString('hex') },
    })
    expect((await send(fx.users.teacher.email, 'wrong-password')).status).toBe(401)
    expect((await send(fx.users.teacher.email, fx.password)).status).toBe(200)
    const stored = (await fx.payload.db.findOne({
      collection: 'users',
      where: { id: { equals: fx.users.teacher.id } },
    })) as { hash?: string }
    expect(stored.hash).toMatch(/^pbkdf2-sha256-v1:/)
  })
  it('keeps verification and disabled-account guidance behind a correct password', async () => {
    const pending = await createUserVerified(fx.payload, {
      email: `${MARK}pending@example.test`,
      name: `${MARK}Pending`,
      password: fx.password,
      _verified: false,
    })
    const disabled = await createUserVerified(fx.payload, {
      email: `${MARK}disabled@example.test`,
      name: `${MARK}Disabled`,
      password: fx.password,
      signInDisabled: true,
    })
    for (const user of [pending, disabled]) {
      expect((await send(user.email, 'wrong-password')).status).toBe(401)
      expect((await send(user.email, fx.password)).status).toBe(403)
    }
  })
})
