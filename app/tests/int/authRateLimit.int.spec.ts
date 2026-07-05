/**
 * Integration coverage for the AUTH-operation rate limits (`hooks/authRateLimit.ts`, SPEC §11
 * "generation, auth"; audit 2026-07-04). Drives the real Payload operations through the Local API —
 * `payload.login` / `payload.forgotPassword` run the same `beforeOperation` hook the REST routes do
 * (verified in installed source), against the real `rate_limit_counters` table. Requires a DB →
 * Rock/CI only, like all of `tests/int`.
 *
 * Budget notes for the LIVE Rock DB: a run spends ~(LOGIN_MAX+1) of `loginGlobal` (1000/h) and
 * ~(FORGOT_MAX+1) of `forgotPasswordGlobal` (100/day) — far under both ceilings. Per-target keys
 * are run-unique and deleted in afterAll; the global keys are left (their spend is the test's real
 * traffic).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'

// Per-run addresses so counters/users never collide across runs or with real users.
const RUN = `authrl-${Date.now()}`
const USER_EMAIL = `${RUN}-user@lesson3.local`
const UNKNOWN_EMAIL = `${RUN}-nobody@lesson3.local`
const PASSWORD = `pw-${RUN}-Str0ng!`

// Read budgets the way the limiter module does, so env overrides stay honoured.
const LOGIN_MAX = Number(process.env.RATE_LIMIT_LOGIN_MAX) || 20
const FORGOT_MAX = Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX) || 5

let payload: Payload
let userId: number | undefined

beforeAll(async () => {
  payload = await getPayload({ config })
  const user = await payload.create({
    collection: 'users',
    data: { email: USER_EMAIL, password: PASSWORD, name: `Auth RL ${RUN}` },
  })
  userId = user.id
}, 60_000)

afterAll(async () => {
  if (!payload) return
  if (userId != null) {
    await payload.delete({ collection: 'users', id: userId, overrideAccess: true })
  }
  // Remove this run's per-target counter rows (keys embed the run-tagged emails).
  const db = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } })
    .drizzle
  await db.execute(sql`DELETE FROM "rate_limit_counters" WHERE "bucket_key" LIKE ${`%${RUN}%`};`)
})

describe('login rate limit (per target identifier)', () => {
  it('allows up to the budget, then rejects with 429 — even for CORRECT credentials', async () => {
    for (let i = 0; i < LOGIN_MAX; i++) {
      const res = await payload.login({
        collection: 'users',
        data: { email: USER_EMAIL, password: PASSWORD },
      })
      expect(res.user?.email).toBe(USER_EMAIL)
    }
    await expect(
      payload.login({ collection: 'users', data: { email: USER_EMAIL, password: PASSWORD } }),
    ).rejects.toMatchObject({ status: 429 })
  })

  it('a different identifier keeps an independent budget', async () => {
    // Unknown account → the OPERATION fails (auth error), but not with the limiter's 429: the
    // budget for this fresh identifier was intact. (Also pins that a limited identifier can't
    // exhaust anyone else's budget.)
    await expect(
      payload.login({
        collection: 'users',
        data: { email: `${RUN}-other@lesson3.local`, password: 'wrong-pass-1234' },
      }),
    ).rejects.not.toMatchObject({ status: 429 })
  })
})

describe('forgot-password rate limit (per requested address; no existence oracle)', () => {
  it('spends budget for an UNKNOWN address exactly like a real one, then 429s', async () => {
    // Payload answers a forgot-password for a nonexistent account without erroring (no oracle);
    // the limiter must behave identically — budget keyed on the REQUESTED address.
    for (let i = 0; i < FORGOT_MAX; i++) {
      await payload.forgotPassword({
        collection: 'users',
        data: { email: UNKNOWN_EMAIL },
        disableEmail: true,
      })
    }
    await expect(
      payload.forgotPassword({
        collection: 'users',
        data: { email: UNKNOWN_EMAIL },
        disableEmail: true,
      }),
    ).rejects.toMatchObject({ status: 429 })
  })

  it('a real account is capped on the same budget shape', async () => {
    for (let i = 0; i < FORGOT_MAX; i++) {
      await payload.forgotPassword({
        collection: 'users',
        data: { email: USER_EMAIL },
        disableEmail: true,
      })
    }
    await expect(
      payload.forgotPassword({
        collection: 'users',
        data: { email: USER_EMAIL },
        disableEmail: true,
      }),
    ).rejects.toMatchObject({ status: 429 })
  })
})
