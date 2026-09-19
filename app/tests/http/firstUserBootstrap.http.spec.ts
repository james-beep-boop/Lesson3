/**
 * Fresh-install bootstrap over the real production HTTP surface.
 *
 * This file requires the disposable HTTP-test database to be empty when it starts. Every HTTP spec
 * owns and removes its users; failing that precondition is intentional because a leaked fixture
 * would make this exercise Payload's already-initialized refusal instead of the bootstrap path.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config.js'
import { clearRateLimitBuckets } from '../helpers/db.js'
import { deleteUserFixture } from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'

const postJson = (path: string, body: unknown) =>
  fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Both stock bootstrap entry points must funnel to the one supported form (SPEC §8). */
const expectRedirectToLogin = async (path: string) => {
  const res = await fetch(url(path), { redirect: 'manual' })
  expect([307, 308]).toContain(res.status)
  const location = res.headers.get('location')
  expect(location, `${path} must redirect`).toBeTruthy()
  expect(new URL(location!, url('/')).pathname).toBe('/login')
}

const RUN = `first-bootstrap-${Date.now()}`
const candidates = [
  { email: `${RUN}-a@lesson3.local`, password: `pw-a-${RUN}-Strong!` },
  { email: `${RUN}-b@lesson3.local`, password: `pw-b-${RUN}-Strong!` },
] as const

let payload: Payload
const userIds: Array<number | string> = []

beforeAll(async () => {
  payload = await getPayload({ config })
  const { totalDocs } = await payload.count({ collection: 'users', overrideAccess: true })
  expect(totalDocs, 'first-user bootstrap requires a created-empty HTTP test database').toBe(0)
}, 60_000)

afterAll(async () => {
  try {
    for (const id of userIds.reverse()) await deleteUserFixture(payload, id)
  } finally {
    await clearRateLimitBuckets(payload, `%${RUN}%`)
  }
})

describe('offline first-user bootstrap', () => {
  it('renders setup at /login and keeps ordinary signup out of the empty-database path', async () => {
    const loginPage = await fetch(url('/login'))
    expect(loginPage.status).toBe(200)
    const html = await loginPage.text()
    expect(html).toContain('Create Site administrator')
    expect(html).not.toContain('Forgot password?')

    await expectRedirectToLogin('/admin/create-first-user')
    await expectRedirectToLogin('/signup')

    const ordinaryCreate = await postJson('/api/users', {
      name: 'Wrong path',
      email: `${RUN}-wrong@lesson3.local`,
      password: candidates[0].password,
    })
    expect(ordinaryCreate.status).toBe(403)
    await expect(
      payload.count({ collection: 'users', overrideAccess: true }),
    ).resolves.toMatchObject({
      totalDocs: 0,
    })
  })

  /**
   * The fumbled-setup case, over the wire, because it is the one a technician actually meets.
   *
   * The signup budget is three per address per day. Payload's native `first-register` operation
   * creates with `overrideAccess: true`, so the limiter now classifies it as trusted without knowing
   * this route. Four failing attempts on ONE address must all be refused on their merits and none of
   * them throttled.
   *
   * ⚑ Its own address, not a `candidates` one: if this regresses, it must fail HERE rather than by
   * poisoning the race test's budget two tests later.
   */
  it('does not spend the signup budget while the installation is still empty', async () => {
    const fumbled = `${RUN}-fumble@lesson3.local`
    const attempts = []
    for (let attempt = 0; attempt < 4; attempt++) {
      attempts.push(
        // No password: rejected on its merits, so the users table stays empty and the NEXT
        // attempt is still a genuine bootstrap request.
        await postJson('/api/users/first-register', { name: 'Fumbled setup', email: fumbled }),
      )
    }

    expect(attempts.map(({ status }) => status)).not.toContain(429)
    await expect(
      payload.count({ collection: 'users', overrideAccess: true }),
    ).resolves.toMatchObject({
      totalDocs: 0,
    })
  })

  it('creates exactly one verified administrator under a concurrent first-register race', async () => {
    const responses = await Promise.all(
      candidates.map(({ email, password }, index) =>
        postJson('/api/users/first-register', {
          name: `Offline Site Administrator ${index + 1}`,
          email,
          password,
        }),
      ),
    )
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 403])

    // Only the winner has a body worth reading — the loser is refused and creates nothing to clean
    // up, so there is no second id to collect.
    const winnerIndex = responses.findIndex(({ status }) => status === 200)
    const winner = candidates[winnerIndex]!
    const response = responses[winnerIndex]!
    expect(response.headers.get('set-cookie')).toBeTruthy()

    const body = (await response.json()) as { token?: string; user?: { id?: number | string } }
    expect(body.token).toBeTruthy()
    expect(body.user?.id).toBeDefined()
    userIds.push(body.user!.id!)

    const stored = await payload.findByID({
      collection: 'users',
      id: body.user!.id!,
      overrideAccess: true,
      showHiddenFields: true,
    })
    expect(stored.roles).toContain('siteAdmin')
    expect(stored._verified).toBe(true)

    // The helper asserts a token came back, not merely a 200 — the failure mode `httpWire.ts` exists
    // to stop this suite re-introducing.
    await expect(login(winner.email, winner.password)).resolves.toBeTruthy()
  })

  it('closes the one-shot endpoint and restores the ordinary login screen', async () => {
    const second = await postJson('/api/users/first-register', {
      name: 'Second',
      email: `${RUN}-second@lesson3.local`,
      password: candidates[0].password,
    })
    expect(second.status).toBe(403)

    const loginPage = await fetch(url('/login'))
    expect(loginPage.status).toBe(200)
    const html = await loginPage.text()
    expect(html).toContain('Sign in')
    expect(html).toContain('Forgot password?')
    expect(html).not.toContain('Create Site administrator')
  })
})
