/**
 * Executable regression test for the email-verification migration's LOAD-BEARING backfill
 * (Codex 2026-07-10 P3). The migration's `UPDATE users SET "_verified" = true WHERE NULL` is what
 * keeps every PRE-EXISTING account usable once `auth.verify` is on — the JWT strategy rejects
 * falsy `_verified`, so a missed backfill is a fleet-wide lockout that a fresh-schema test suite
 * never sees (its users are all created post-verify).
 *
 * The int suite runs on dev-push schema (columns already exist), so this simulates the
 * pre-migration state the only way an executable test can: null a user's `_verified` via raw SQL
 * (exactly what a plain ADD COLUMN leaves behind), then run the migration's REAL exported `up()`
 * against the live schema and assert:
 *   - the NULL row is backfilled to true and the account can LOG IN afterwards,
 *   - a post-migration unverified signup (`_verified = false`) is NOT flipped by a re-run
 *     (the WHERE NULL guard),
 *   - `up()` completes against an already-migrated schema at all (the idempotency guards).
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { createUserVerified } from '../helpers/fixtures.js'
import { up } from '../../src/migrations/20260710_041621_add_email_verification.js'

const RUN = `verifybf-${Date.now()}`
const LEGACY_EMAIL = `${RUN}-legacy@example.com`
const UNVERIFIED_EMAIL = `${RUN}-unverified@example.com`
const PASSWORD = `pw-${RUN}-Str0ng!`

let payload: Payload
let legacyId: number
let unverifiedId: number

const drizzle = () =>
  (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle

const verifiedOf = async (id: number) =>
  (await payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true }))._verified

beforeAll(async () => {
  payload = await getPayload({ config })
  // "Legacy" account: created, then `_verified` forced to NULL — the exact state a plain
  // ADD COLUMN leaves every pre-migration row in.
  const legacy = await createUserVerified(payload, {
    name: `Verify BF legacy ${RUN}`,
    email: LEGACY_EMAIL,
    password: PASSWORD,
  })
  legacyId = legacy.id
  await drizzle().execute(sql`UPDATE "users" SET "_verified" = NULL WHERE "id" = ${legacyId};`)

  // Post-migration unverified signup: must SURVIVE a re-run un-flipped.
  const unverified = await createUserVerified(payload, {
    name: `Verify BF unverified ${RUN}`,
    email: UNVERIFIED_EMAIL,
    password: PASSWORD,
    _verified: false,
  })
  unverifiedId = unverified.id
}, 60_000)

afterAll(async () => {
  if (!payload) return
  await payload.delete({
    collection: 'users',
    where: { email: { in: [LEGACY_EMAIL, UNVERIFIED_EMAIL] } },
    overrideAccess: true,
  })
  // The login assertion spends auth budgets keyed by this run's email.
  await drizzle().execute(
    sql`DELETE FROM "rate_limit_counters" WHERE "bucket_key" LIKE ${`%${RUN}%`};`,
  )
})

describe('email-verification migration backfill (executable, Codex 2026-07-10)', () => {
  it('up() backfills NULL to true, leaves false alone, and is idempotent on a migrated schema', async () => {
    expect(await verifiedOf(legacyId)).toBeNull() // the simulated pre-migration state took

    await up({ db: drizzle() } as unknown as Parameters<typeof up>[0])

    expect(await verifiedOf(legacyId)).toBe(true) // backfilled — the lockout-prevention property
    expect(await verifiedOf(unverifiedId)).toBe(false) // WHERE NULL guard held on a re-run
  })

  it('the backfilled legacy account can actually log in', async () => {
    const result = await payload.login({
      collection: 'users',
      data: { email: LEGACY_EMAIL, password: PASSWORD },
    })
    expect(result.user?.id).toBe(legacyId)
  })
})
