/**
 * Wire-level authorization for the Site-Admin user actions (`endpoints/userAdminActions.ts`).
 *
 * ⚑ THIS FILE IS THE STANDING GUARD `CLAUDE.md` REQUIRES, not optional coverage. All three endpoints
 * authorize the caller and then write with `overrideAccess: true` — a pattern that is only as safe as
 * the test proving the gate runs FIRST. `signInDisabled` and the base `sessions` field both carry
 * `update: () => false`, so if the authorization check were ever moved, reordered, or lost, the
 * `overrideAccess` write would happily proceed for anybody and nothing else in the suite would notice.
 *
 * HOW IT RUNS: like the rest of `tests/http` — a running app plus a seedable DB, MARK-tagged and
 * self-cleaning, over the real network at `E2E_BASE_URL`:
 *
 *   scripts/in-deps.sh --network lesson3_default --env-file .env \
 *     -e NODE_ENV=production -e E2E_BASE_URL=http://app:3000 -- npm run test:http
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { MARK, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures.js'
// `HTTP_BASE`/`url`/`login` from the shared wire helper — its own docblock records that it exists
// because the third copy had drifted, and its `login` throws with the address and status on failure
// (a hand-rolled one dies inside `beforeAll` on a proxy HTML page with no clue which account).
import { login, url } from '../helpers/httpWire.js'
// The code constant, not a hardcoded string: one spelling shared with the thrower and both forms.
import { ACCOUNT_DISABLED_CODE, type ErrorWire } from '../../src/errors/AccountDisabled.js'

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

let fx: RoleFixture
const token: Record<string, string> = {}
/** A throwaway target so no assertion depends on mutating a shared fixture account. */
let targetId = 0
let targetUpdatedAt = ''

/** POST one of the three actions. `as` omitted → unauthenticated. */
async function act(
  path: string,
  body: unknown,
  as?: RoleKey,
): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
  const res = await fetch(url(`/api/users/${path}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(as && token[as] ? { Authorization: `JWT ${token[as]}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json, headers: res.headers }
}

/** Re-read the target's `updatedAt` so a freshness-guarded call can succeed. */
async function freshUpdatedAt(): Promise<string> {
  const res = await fetch(url(`/api/users/${targetId}?depth=0`), {
    headers: { Authorization: `JWT ${token.siteAdmin!}` },
  })
  const body = (await res.json()) as { updatedAt?: string }
  return String(body.updatedAt)
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens = await Promise.all(ROLES.map((k) => login(fx.users[k].email, fx.password)))
  ROLES.forEach((k, i) => (token[k] = tokens[i]!))

  const target = await fx.payload.create({
    collection: 'users',
    data: {
      email: `${MARK}action-target@lesson3.local`,
      password: fx.password,
      name: `${MARK}Action Target`,
      _verified: true,
    } as never,
    overrideAccess: true,
  })
  targetId = target.id
  targetUpdatedAt = String(target.updatedAt)
}, 120_000)

afterAll(async () => {
  if (targetId) {
    await fx?.payload
      .delete({ collection: 'users', id: targetId, overrideAccess: true })
      .catch(() => undefined)
  }
  await fx?.teardown()
})

describe.each([
  ['reveal-reset-link', {} as Record<string, unknown>],
  ['set-site-admin', { enabled: false }],
  ['set-sign-in-disabled', { enabled: true }],
])('POST /api/users/:id/%s', (action, extra) => {
  it('401 unauthenticated', async () => {
    const { status } = await act(`${targetId}/${action}`, {
      expectedUpdatedAt: targetUpdatedAt,
      ...extra,
    })
    expect(status).toBe(401)
  })

  it.each(['teacher', 'editor', 'subjectAdmin'] as RoleKey[])('403 for %s', async (role) => {
    // ⚑ Subject Admin is included deliberately: they hold collection-level update on users (so the
    // assignment-scope hook can validate their edits), which is exactly the authority that would
    // make a missing gate here invisible.
    const { status } = await act(
      `${targetId}/${action}`,
      { expectedUpdatedAt: targetUpdatedAt, ...extra },
      role,
    )
    expect(status).toBe(403)
  })

  it('404-or-400 for an unknown user id', async () => {
    const { status } = await act(
      `99999999/${action}`,
      { expectedUpdatedAt: targetUpdatedAt, ...extra },
      'siteAdmin',
    )
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })

  it('400 when expectedUpdatedAt is missing', async () => {
    const { status } = await act(`${targetId}/${action}`, { ...extra }, 'siteAdmin')
    expect(status).toBe(400)
  })

  it('409 on a stale expectedUpdatedAt', async () => {
    const stale = new Date(Date.parse(targetUpdatedAt) - 60_000).toISOString()
    const { status } = await act(
      `${targetId}/${action}`,
      { expectedUpdatedAt: stale, ...extra },
      'siteAdmin',
    )
    expect(status).toBe(409)
  })
})

describe('happy paths', () => {
  it('reveal-reset-link returns a usable link, no-store, and never echoes the raw token alone', async () => {
    const { status, json, headers } = await act(
      `${targetId}/reveal-reset-link`,
      { expectedUpdatedAt: await freshUpdatedAt() },
      'siteAdmin',
    )
    expect(status).toBe(200)
    expect(String(json.link)).toContain('/reset-password?token=')
    expect(json.expiresInMinutes).toBe(60)
    // D5a-iii: a live credential must not sit in a shared or browser cache.
    expect(headers.get('cache-control')).toBe('no-store')
  })

  it('set-sign-in-disabled disables the account, and the user can no longer log in', async () => {
    const { status } = await act(
      `${targetId}/set-sign-in-disabled`,
      { expectedUpdatedAt: await freshUpdatedAt(), enabled: true },
      'siteAdmin',
    )
    expect(status).toBe(200)

    const res = await fetch(url('/api/users/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${MARK}action-target@lesson3.local`, password: fx.password }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as ErrorWire
    // The wire contract, over the real network — not just in the unit test's serialiser.
    expect(body.errors?.[0]?.data?.code).toBe(ACCOUNT_DISABLED_CODE)
  })

  it('refuses a reset link for a DISABLED account (409), rather than minting a dead credential', async () => {
    const { status } = await act(
      `${targetId}/reveal-reset-link`,
      { expectedUpdatedAt: await freshUpdatedAt() },
      'siteAdmin',
    )
    expect(status).toBe(409)
  })

  it('re-enabling restores sign-in', async () => {
    const { status } = await act(
      `${targetId}/set-sign-in-disabled`,
      { expectedUpdatedAt: await freshUpdatedAt(), enabled: false },
      'siteAdmin',
    )
    expect(status).toBe(200)
    const res = await fetch(url('/api/users/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${MARK}action-target@lesson3.local`, password: fx.password }),
    })
    expect(res.status).toBe(200)
  })
})
