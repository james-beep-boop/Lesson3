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
const ADMIN_RESET_MAX = Number(process.env.RATE_LIMIT_ADMIN_RESET_LINK_MAX) || 30

let fx: RoleFixture
const token: Record<string, string> = {}
/** A throwaway target so no assertion depends on mutating a shared fixture account. */
let targetId = 0
let targetUpdatedAt = ''
let rateAdminId = 0
let rateAdminToken = ''

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

  // A dedicated caller for the admin-cap test. Its bucket is isolated from every authorization and
  // happy-path request above, so the exact request at which it reaches 429 is deterministic.
  const rateAdmin = await fx.payload.create({
    collection: 'users',
    data: {
      email: `${MARK}action-rate-admin@lesson3.local`,
      password: fx.password,
      name: `${MARK}Action Rate Admin`,
      roles: ['siteAdmin'],
      _verified: true,
    } as never,
    overrideAccess: true,
  })
  rateAdminId = rateAdmin.id
  rateAdminToken = await login(`${MARK}action-rate-admin@lesson3.local`, fx.password)
}, 120_000)

afterAll(async () => {
  if (targetId) {
    await fx?.payload
      .delete({ collection: 'users', id: targetId, overrideAccess: true })
      .catch(() => undefined)
  }
  if (rateAdminId) {
    await fx?.payload
      .delete({ collection: 'users', id: rateAdminId, overrideAccess: true })
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

  it('404 for an unknown user id', async () => {
    // Exactly 404, not "some 4xx". A range assertion would pass on a 400 from a body-shape change or
    // a 403 from a broken gate — i.e. it would keep passing through the failures it exists to catch.
    const { status } = await act(
      `99999999/${action}`,
      { expectedUpdatedAt: targetUpdatedAt, ...extra },
      'siteAdmin',
    )
    expect(status).toBe(404)
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
  it('reveal-reset-link returns a usable link, no-store, and a refreshed updatedAt', async () => {
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
    // ⚑ The post-mint `updatedAt`, because minting the token WROTE to the user row
    // (`forgotPasswordOperation` sets `resetPasswordToken`/`Expiration` via `payload.update`). Without
    // this in the response, the caller's next action would carry a token the mint itself invalidated
    // and take a spurious 409.
    expect(typeof json.updatedAt).toBe('string')
    expect(Date.parse(String(json.updatedAt))).toBeGreaterThan(Date.parse(targetUpdatedAt))
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
    // ⚑ SELF-CONTAINED. An earlier version relied on the preceding test having left the account
    // disabled — declaration order as a hidden precondition, which is the same defect class already
    // fixed once in `manage.e2e.spec.ts`. This disables the account itself and re-enables it at the
    // end, so it passes in isolation and in any order.
    const disable = await act(
      `${targetId}/set-sign-in-disabled`,
      { expectedUpdatedAt: await freshUpdatedAt(), enabled: true },
      'siteAdmin',
    )
    expect(disable.status).toBe(200)

    const { status } = await act(
      `${targetId}/reveal-reset-link`,
      { expectedUpdatedAt: await freshUpdatedAt() },
      'siteAdmin',
    )
    expect(status).toBe(409)

    const restore = await act(
      `${targetId}/set-sign-in-disabled`,
      { expectedUpdatedAt: await freshUpdatedAt(), enabled: false },
      'siteAdmin',
    )
    expect(restore.status).toBe(200)
  })

  it('set-site-admin grants and revokes the role', async () => {
    // The third endpoint's happy path, which the first draft left untested — every other assertion
    // about it was a refusal, so a completely broken write would have looked fine.
    const grant = await act(
      `${targetId}/set-site-admin`,
      { expectedUpdatedAt: await freshUpdatedAt(), enabled: true },
      'siteAdmin',
    )
    expect(grant.status).toBe(200)
    const afterGrant = await fetch(url(`/api/users/${targetId}?depth=0`), {
      headers: { Authorization: `JWT ${token.siteAdmin!}` },
    })
    expect(((await afterGrant.json()) as { roles?: string[] }).roles).toContain('siteAdmin')

    const revoke = await act(
      `${targetId}/set-site-admin`,
      { expectedUpdatedAt: await freshUpdatedAt(), enabled: false },
      'siteAdmin',
    )
    expect(revoke.status).toBe(200)
    const afterRevoke = await fetch(url(`/api/users/${targetId}?depth=0`), {
      headers: { Authorization: `JWT ${token.siteAdmin!}` },
    })
    expect(((await afterRevoke.json()) as { roles?: string[] }).roles ?? []).not.toContain(
      'siteAdmin',
    )
  })

  it('re-enabling restores sign-in', async () => {
    // Establish the precondition here. A previous version only sent `enabled: false`, so it passed
    // when the account was already enabled and proved nothing about the disabled → enabled transition.
    const disable = await act(
      `${targetId}/set-sign-in-disabled`,
      { expectedUpdatedAt: await freshUpdatedAt(), enabled: true },
      'siteAdmin',
    )
    expect(disable.status).toBe(200)

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

describe('admin reset-link rate limit', () => {
  it('returns 429 with Retry-After when the dedicated admin exhausts its own budget', async () => {
    let blocked: Response | undefined
    for (let i = 0; i <= ADMIN_RESET_MAX; i++) {
      const res = await fetch(url(`/api/users/${targetId}/reveal-reset-link`), {
        method: 'POST',
        headers: {
          Authorization: `JWT ${rateAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expectedUpdatedAt: await freshUpdatedAt() }),
      })
      if (res.status === 429) {
        blocked = res
        break
      }
      expect(res.status, `admin reset-link request #${i + 1}`).toBe(200)
    }

    expect(blocked?.status).toBe(429)
    expect(Number(blocked?.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(blocked?.headers.get('Cache-Control')).toBe('no-store')
  })
})
