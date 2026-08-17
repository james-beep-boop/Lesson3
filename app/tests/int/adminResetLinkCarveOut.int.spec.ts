/**
 * The admin reset-link rate-limit CARVE-OUT (D5a-i).
 *
 * ⚑ TWO TESTS, NOT ONE, and the second is the point. "The admin path is not throttled by the public
 * budget" is satisfied just as well by deleting the public throttle entirely — which would be a
 * bypass, not a carve-out. Asserting that the ordinary public `forgotPassword` is STILL throttled is
 * what distinguishes them, and it is the assertion that fails if someone later "simplifies" the
 * `req.context` check into `if (req.user) return args`.
 *
 * Requires a DB (the real `rate_limit_counters` table) → Rock/CI only.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { createUserVerified } from '../helpers/fixtures.js'
import { ADMIN_RESET_LINK_CONTEXT } from '../../src/hooks/authRateLimit.js'

const RUN = `carveout-${Date.now()}`
const PASSWORD = `pw-${RUN}-Str0ng!`
const TARGET = `${RUN}-target@lesson3.local`
const PUBLIC_TARGET = `${RUN}-public@lesson3.local`
const FORGOT_MAX = Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX) || 5

let payload: Payload
const created: number[] = []

beforeAll(async () => {
  payload = await getPayload({ config })
  for (const email of [TARGET, PUBLIC_TARGET]) {
    const u = await createUserVerified(payload, {
      email,
      password: PASSWORD,
      name: `${RUN} ${email}`,
    })
    created.push(u.id)
  }
}, 60_000)

afterAll(async () => {
  for (const id of created) {
    await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
  }
  await payload.db.drizzle
    .execute(sql`DELETE FROM rate_limit_counters WHERE key LIKE ${`%${RUN}%`}`)
    .catch(() => undefined)
})

describe('the admin reset-link carve-out', () => {
  it('does NOT consume the public per-address budget when the context flag is set', async () => {
    // Drive the operation the way the endpoint does: the flag is on `req.context`, which is
    // server-side only and cannot be set from a request body — that is what makes it safe.
    const rounds = FORGOT_MAX + 3
    for (let i = 0; i < rounds; i++) {
      const token = await payload.forgotPassword({
        collection: 'users',
        data: { email: TARGET },
        disableEmail: true,
        context: { [ADMIN_RESET_LINK_CONTEXT]: true },
      } as never)
      expect(token, `admin mint #${i + 1} should not be throttled`).toBeTruthy()
    }
  })

  it('the ordinary PUBLIC forgot-password is still throttled — carve-out, not bypass', async () => {
    // No context flag. This must hit the wall at the configured budget.
    let threw: unknown = null
    for (let i = 0; i < FORGOT_MAX + 2; i++) {
      try {
        await payload.forgotPassword({
          collection: 'users',
          data: { email: PUBLIC_TARGET },
          disableEmail: true,
        })
      } catch (e) {
        threw = e
        break
      }
    }
    expect(threw, 'the public path must still be rate limited').toBeTruthy()
    expect(String((threw as Error).message)).toMatch(/too many/i)
  })
})
