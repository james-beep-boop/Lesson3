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
import { url } from '../helpers/httpWire.js'

const RUN = `first-bootstrap-${Date.now()}`
const candidates = [
  { email: `${RUN}-a@lesson3.local`, password: `pw-a-${RUN}-Strong!` },
  { email: `${RUN}-b@lesson3.local`, password: `pw-b-${RUN}-Strong!` },
] as const

let payload: Payload
const userIds: Array<number | string> = []
let winningEmail = ''
let winningPassword = ''

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

    const stockAdminSetup = await fetch(url('/admin/create-first-user'), { redirect: 'manual' })
    expect([307, 308]).toContain(stockAdminSetup.status)
    const stockAdminLocation = stockAdminSetup.headers.get('location')
    expect(stockAdminLocation).toBeTruthy()
    expect(new URL(stockAdminLocation!, url('/')).pathname).toBe('/login')

    const signupPage = await fetch(url('/signup'), { redirect: 'manual' })
    expect([307, 308]).toContain(signupPage.status)
    const signupLocation = signupPage.headers.get('location')
    expect(signupLocation).toBeTruthy()
    expect(new URL(signupLocation!, url('/')).pathname).toBe('/login')

    const ordinaryCreate = await fetch(url('/api/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Wrong path',
        email: `${RUN}-wrong@lesson3.local`,
        password: candidates[0].password,
      }),
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
   * The signup budget is three per address per day and `first-register` reaches the limiter as an
   * unauthenticated create, so before the carve-out a fourth attempt answered 429 — on a box with no
   * second administrator, no mail path and no reset route. Four failing attempts on ONE address must
   * all be refused on their merits and none of them throttled.
   *
   * ⚑ Its own address, not a `candidates` one: if this regresses, it must fail HERE rather than by
   * poisoning the race test's budget two tests later.
   */
  it('does not spend the signup budget while the installation is still empty', async () => {
    const fumbled = `${RUN}-fumble@lesson3.local`
    const attempts = []
    for (let attempt = 0; attempt < 4; attempt++) {
      attempts.push(
        await fetch(url('/api/users/first-register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // No password: rejected on its merits, so the users table stays empty and the NEXT
          // attempt is still a genuine bootstrap request.
          body: JSON.stringify({ name: 'Fumbled setup', email: fumbled }),
        }),
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
        fetch(url('/api/users/first-register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Offline Site Administrator ${index + 1}`,
            email,
            password,
          }),
        }),
      ),
    )
    const bodies = await Promise.all(
      responses.map(async (candidateResponse) =>
        candidateResponse.status === 200
          ? ((await candidateResponse.json()) as {
              token?: string
              user?: { id?: number | string }
            })
          : null,
      ),
    )
    for (const body of bodies) {
      if (body?.user?.id != null) userIds.push(body.user.id)
    }

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 403])
    const winnerIndex = responses.findIndex(({ status }) => status === 200)
    const response = responses[winnerIndex]!
    winningEmail = candidates[winnerIndex]!.email
    winningPassword = candidates[winnerIndex]!.password
    expect(response.headers.get('set-cookie')).toBeTruthy()

    const body = bodies[winnerIndex]!
    expect(body.token).toBeTruthy()
    expect(body.user?.id).toBeDefined()

    const stored = await payload.findByID({
      collection: 'users',
      id: body.user!.id!,
      overrideAccess: true,
      showHiddenFields: true,
    })
    expect(stored.roles).toContain('siteAdmin')
    expect(stored._verified).toBe(true)

    const login = await fetch(url('/api/users/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: winningEmail, password: winningPassword }),
    })
    expect(login.status).toBe(200)
  })

  it('closes the one-shot endpoint and restores the ordinary login screen', async () => {
    const second = await fetch(url('/api/users/first-register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Second',
        email: `${RUN}-second@lesson3.local`,
        password: candidates[0].password,
      }),
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
