/**
 * Integration coverage for the SHARED (Postgres-backed) per-user rate limiter (`lib/rateLimit.ts`,
 * readiness #9). Proves the limiter enforces the per-bucket budget against the real
 * `rate_limit_counters` table — the property the old in-memory window could not guarantee across
 * processes. Drives `enforceUserRateLimit` directly with a minimal req (it only reads `req.user.id`
 * and `req.payload.db`). Requires a DB → Rock only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { getPayload, type Payload, type PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { enforceSharedRateLimit, enforceUserRateLimit } from '../../src/lib/rateLimit.js'

// Per-run user ids so the counters start clean and never collide with other runs or real users.
const RUN = `rltest-${Date.now()}`
const userA = `${RUN}-a`
const userB = `${RUN}-b`

// Read the budget the same way the limiter module does, so the test tracks any env override.
const EXPORT_MAX = Number(process.env.RATE_LIMIT_EXPORT_MAX) || 20

let payload: Payload
const reqFor = (id: string) => ({ user: { id }, payload }) as unknown as PayloadRequest

beforeAll(async () => {
  payload = await getPayload({ config })
}, 60_000)

afterAll(async () => {
  // If beforeAll failed to boot Payload, skip cleanup — otherwise this throws a secondary TypeError
  // that masks the real setup failure in the output.
  if (!payload) return
  // Remove only this run's counter rows (keys are `${bucket}:${userId}`).
  const db = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
  await db.execute(sql`DELETE FROM "rate_limit_counters" WHERE "bucket_key" LIKE ${`%:${RUN}-%`};`)
})

describe('enforceUserRateLimit (shared Postgres store)', () => {
  it('allows up to the bucket max, then 429s with a Retry-After', async () => {
    for (let i = 0; i < EXPORT_MAX; i++) {
      expect(await enforceUserRateLimit(reqFor(userA), 'export')).toBeNull()
    }
    const blocked = await enforceUserRateLimit(reqFor(userA), 'export')
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    expect(Number(blocked!.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
  })

  it('is per-user — a different user keeps an independent budget', async () => {
    expect(await enforceUserRateLimit(reqFor(userB), 'export')).toBeNull()
  })

  it('rejects an unauthenticated caller with 401', async () => {
    const res = await enforceUserRateLimit({ payload } as unknown as PayloadRequest, 'export')
    expect(res?.status).toBe(401)
  })
})

describe('enforceSharedRateLimit (non-user keys — email abuse controls, Codex audit 2026-07-02)', () => {
  // Keys embed RUN (after the bucket's colon) so the afterAll LIKE-cleanup catches them too.
  const RECIPIENT_MAX = Number(process.env.RATE_LIMIT_EMAIL_RECIPIENT_MAX) || 20

  it('a shared key counts ACROSS callers and 429s with the supplied message', async () => {
    const key = `${RUN}-shared-recipient`
    // Alternate two different requesting users against the SAME recipient key — the budget is the
    // key's, not the caller's (that cross-sender pooling is the whole point of the recipient cap).
    for (let i = 0; i < RECIPIENT_MAX; i++) {
      expect(
        await enforceSharedRateLimit(reqFor(i % 2 === 0 ? userA : userB), 'emailRecipient', key, 'capped'),
      ).toBeNull()
    }
    const blocked = await enforceSharedRateLimit(reqFor(userA), 'emailRecipient', key, 'recipient capped')
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    expect(Number(blocked!.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(((await blocked!.json()) as { errors: { message: string }[] }).errors[0].message).toBe(
      'recipient capped',
    )
  })

  it('distinct shared keys keep independent budgets', async () => {
    expect(
      await enforceSharedRateLimit(reqFor(userA), 'emailRecipient', `${RUN}-other-recipient`, 'capped'),
    ).toBeNull()
  })
})
