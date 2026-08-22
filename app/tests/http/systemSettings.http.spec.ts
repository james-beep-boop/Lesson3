/**
 * Wire-level authorization for the `system-settings` global.
 *
 * ⚑ THIS FILE EXISTS BECAUSE ITS ABSENCE HID A REAL HOLE. Part 1 (#265) shipped
 * `access: { read: siteAdminOnly, update: siteAdminOnly }` alongside a design requiring password
 * re-authentication, a freshness token, an acknowledgement and provenance on every settings write — and
 * nothing checked whether the ordinary REST door was still open. It was: a Site Administrator could
 * `POST /api/globals/system-settings` — the verb Payload actually routes — and skip all four.
 *
 * ⚑ AND THE INTERVENING "FIX" DID NOT CLOSE IT. #266 added `admin: { hidden: true }`, which I described
 * as closing the contradiction. `globals/operations/update.js` never consults `admin.hidden` — it gates
 * on `executeAccess` alone — so hiding the global removed the admin FORM and left the API untouched. A
 * narrowed surface reported as a shut door, and only a wire test can tell those apart.
 *
 * So the assertion that matters here is the SITE ADMINISTRATOR's refusal. Every other role failing
 * proves ordinary access control works; the Site Administrator failing proves the Save endpoint is the
 * sole writer, which is the thing the whole ceremony rests on.
 *
 * HOW IT RUNS: like the rest of `tests/http` — a running app plus a seedable DB, MARK-tagged and
 * self-cleaning, over the real network at `E2E_BASE_URL`:
 *
 *   scripts/in-deps.sh --network lesson3_default --env-file .env \
 *     -e E2E_BASE_URL=http://app:3000 -- npm run test:http
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

let fx: RoleFixture
const token: Record<string, string> = {}

const GLOBAL_URL = () => url('/api/globals/system-settings')

/**
 * ⚑ THE WRITE VERB IS `POST`, NOT `PATCH`. Measured against the running app: `POST` → 403,
 * `PATCH` → 404, `PUT` → 404. Payload routes a global update as POST, so a PATCH-based test probes a
 * route that does not exist — and would have "passed" the moment its expectation included 404, proving
 * nothing about authorization. Worth stating because PATCH is the natural guess (it is the verb the
 * `users` endpoints use, and what the earlier draft of this file assumed).
 */
async function request(method: 'GET' | 'POST', as?: RoleKey): Promise<{ status: number }> {
  const res = await fetch(GLOBAL_URL(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(as && token[as] ? { Authorization: `JWT ${token[as]}` } : {}),
    },
    ...(method === 'GET'
      ? {}
      : { body: JSON.stringify({ features: { publicLibraryLive: false } }) }),
  })
  return { status: res.status }
}

/** Read through the Local API, so the assertion cannot be fooled by a serialization quirk. */
async function storedFlag(): Promise<boolean | null | undefined> {
  const doc = await fx.payload.findGlobal({
    slug: 'system-settings',
    depth: 0,
    overrideAccess: true,
  })
  return (doc.features as { publicLibraryLive?: boolean | null } | undefined)?.publicLibraryLive
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens = await Promise.all(ROLES.map((k) => login(fx.users[k].email, fx.password)))
  ROLES.forEach((k, i) => (token[k] = tokens[i]!))
  // A known starting value, written the way the Save endpoint will.
  await fx.payload.updateGlobal({
    slug: 'system-settings',
    data: { features: { publicLibraryLive: true } } as never,
    overrideAccess: true,
    user: fx.users.siteAdmin,
  })
})

afterAll(async () => {
  await fx?.teardown()
})

describe('system-settings — the ordinary write door is shut', () => {
  /**
   * ⚑ THE CASE THIS FILE IS FOR. Not "a Teacher cannot write settings" — obviously — but "the person
   * who legitimately administers everything still cannot write them THIS WAY", because the write has to
   * carry a re-authentication and an acknowledgement that only the Save endpoint asks for.
   */
  it('refuses a Site Administrator writing the global directly, and changes nothing', async () => {
    const before = await storedFlag()
    const res = await request('POST', 'siteAdmin')
    expect(
      res.status,
      'a Site Administrator must not write settings through the ordinary door',
    ).toBe(403)
    expect(await storedFlag(), 'the refused write must not have landed').toBe(before)
  })

  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${role} writing the global`, async () => {
      expect((await request('POST', role)).status).toBe(403)
    })
  }

  it('refuses an unauthenticated write', async () => {
    // 401 or 403 depending on how Payload frames an anonymous denial; either is a refusal, and pinning
    // the exact code here would test Payload rather than this boundary. ⚑ NOT 404 — a 404 would mean
    // the verb is unrouted and the test is probing nothing (see the note on `request`).
    expect([401, 403]).toContain((await request('POST')).status)
  })
})

describe('system-settings — reads stay Site-Admin-only', () => {
  it('lets a Site Administrator read it', async () => {
    expect((await request('GET', 'siteAdmin')).status).toBe(200)
  })

  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${role} reading it`, async () => {
      expect((await request('GET', role)).status).toBe(403)
    })
  }

  it('refuses an unauthenticated read', async () => {
    expect([401, 403]).toContain((await request('GET')).status)
  })
})
