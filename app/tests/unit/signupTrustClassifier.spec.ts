/**
 * The TRUST AXIS of the signup rate limit: which user creates are counted as anonymous signups.
 *
 * ⚑ THE POINT OF THIS FILE IS THE POSITIVE CASE, not the exemption. That a trusted create is
 * uncounted is the easy half and the half a careless refactor keeps working. What must go red is the
 * exemption widening — an ordinary anonymous `POST /api/users` escaping the cap would turn the open
 * self-registration limiter off entirely, and nothing else in the suite would notice.
 *
 * Background: #324. `overrideAccess` is an operation argument that Payload's `buildBeforeOperation`
 * passes to every `beforeOperation` hook. It is set in-process by the caller and is unreachable from
 * any request body, header or query parameter — which is the property that makes it a sound trust
 * signal. The REST create handler never forwards it, so wire signups stay counted.
 *
 * No database and no Payload boot: the decision is a property of three arguments, and
 * `consumeRateLimit` is the observable side effect, so it is spied rather than executed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const consumeRateLimit = vi.fn()

vi.mock('../../src/lib/rateLimit', () => ({
  consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
}))

const { rateLimitAuthOperations } = await import('../../src/hooks/authRateLimit')

/** A create as Payload delivers it to `beforeOperation`. No `req.user` = unauthenticated. */
const create = (opts: { user?: unknown; overrideAccess?: boolean; pathname?: string }) =>
  rateLimitAuthOperations({
    args: { data: { email: 'someone@lesson3.local' } },
    operation: 'create',
    overrideAccess: opts.overrideAccess,
    req: { user: opts.user ?? null, pathname: opts.pathname ?? '/api/users' },
  } as never)

const bucketsCharged = () => consumeRateLimit.mock.calls.map((call) => call[1])

beforeEach(() => {
  consumeRateLimit.mockReset()
  consumeRateLimit.mockResolvedValue({ ok: true, retryAfterSec: 0 })
})

describe('signup trust classifier', () => {
  it('COUNTS an ordinary anonymous wire signup', async () => {
    // ⚑ The test that catches this becoming a bypass. The REST create handler forwards no
    // `overrideAccess`, so this is the shape every real `POST /api/users` arrives in.
    await create({})
    expect(bucketsCharged()).toEqual(['signup', 'signupGlobal'])
  })

  it('counts it when overrideAccess is explicitly false', async () => {
    await create({ overrideAccess: false })
    expect(bucketsCharged()).toEqual(['signup', 'signupGlobal'])
  })

  it('does NOT count a trusted server-side create (#324)', async () => {
    // Local-API fixtures and seed scripts: `payload.create({ overrideAccess: true })`.
    await create({ overrideAccess: true })
    expect(consumeRateLimit).not.toHaveBeenCalled()
  })

  it('does not count first-register, WITHOUT the limiter knowing the route (#336 subsumed)', async () => {
    // registerFirstUserOperation calls `payload.create({ overrideAccess: true, req })`. The pathname
    // is supplied here only to prove it is NOT what earns the exemption any more.
    await create({ overrideAccess: true, pathname: '/api/users/first-register' })
    expect(consumeRateLimit).not.toHaveBeenCalled()
  })

  it('still counts an anonymous create ON the first-register path when untrusted', async () => {
    // The mirror of the case above: the path alone earns nothing.
    await create({ pathname: '/api/users/first-register' })
    expect(bucketsCharged()).toEqual(['signup', 'signupGlobal'])
  })

  it('does not count an authenticated create', async () => {
    await create({ user: { id: 1 } })
    expect(consumeRateLimit).not.toHaveBeenCalled()
  })

  it('keeps the 429 when the budget is gone, so the classifier has not disarmed the limiter', async () => {
    consumeRateLimit.mockResolvedValue({ ok: false, retryAfterSec: 60 })
    await expect(create({})).rejects.toThrow(/too many sign-up attempts/i)
  })
})
