/**
 * The SCOPE of the signup rate-limit carve-out for `first-register` (2026-09-18).
 *
 * ⚑ THE POINT OF THIS FILE IS THE NEGATIVE CASES. That the bootstrap request is exempt is the easy
 * half and the half a careless refactor keeps working. What must go red is the carve-out widening:
 * ordinary signup escaping the cap, or first-register staying uncapped after initialization — which
 * would leave an unauthenticated, password-hashing endpoint with no budget for the rest of the
 * installation's life.
 *
 * No database and no Payload boot: the hook's decision is a property of `pathname` plus a count, and
 * `consumeRateLimit` is the observable side effect, so it is spied rather than executed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const consumeRateLimit = vi.fn()

vi.mock('../../src/lib/rateLimit', () => ({
  consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
}))

const { rateLimitAuthOperations } = await import('../../src/hooks/authRateLimit')

/** A create request as Payload delivers it to `beforeOperation`: no `req.user` = a signup. */
const signupReq = (pathname: string, totalDocs: number) => ({
  pathname,
  user: null,
  payload: { count: vi.fn().mockResolvedValue({ totalDocs }) },
})

const run = (pathname: string, totalDocs: number) =>
  rateLimitAuthOperations({
    args: { data: { email: 'setup@lesson3.local' } },
    operation: 'create',
    req: signupReq(pathname, totalDocs),
  } as never)

beforeEach(() => {
  consumeRateLimit.mockReset()
  consumeRateLimit.mockResolvedValue({ ok: true, retryAfterSec: 0 })
})

describe('first-register signup carve-out', () => {
  it('spends no budget while the installation has no accounts', async () => {
    await run('/api/users/first-register', 0)
    expect(consumeRateLimit).not.toHaveBeenCalled()
  })

  it('CLOSES once an account exists — the exemption is not permanent', async () => {
    // The failure this catches: keying the carve-out on the path alone. first-register is refused
    // after initialization anyway, so an uncapped one would be a free unauthenticated endpoint.
    await run('/api/users/first-register', 1)
    expect(consumeRateLimit).toHaveBeenCalled()
    expect(consumeRateLimit.mock.calls.map((call) => call[1])).toEqual(['signup', 'signupGlobal'])
  })

  it('does NOT exempt ordinary signup on an empty installation', async () => {
    // The other way to over-widen: keying on emptiness alone would uncap `POST /api/users` too.
    await run('/api/users', 0)
    expect(consumeRateLimit).toHaveBeenCalled()
    expect(consumeRateLimit.mock.calls.map((call) => call[1])).toEqual(['signup', 'signupGlobal'])
  })

  it('does not exempt a path that merely CONTAINS the segment', async () => {
    await run('/api/users/first-register/something', 0)
    expect(consumeRateLimit).toHaveBeenCalled()
  })

  it('still throttles ordinary signup after initialization', async () => {
    await run('/api/users', 3)
    expect(consumeRateLimit).toHaveBeenCalled()
  })

  it('keeps the 429 when the budget is gone, so the carve-out has not disarmed the limiter', async () => {
    consumeRateLimit.mockResolvedValue({ ok: false, retryAfterSec: 60 })
    await expect(run('/api/users', 0)).rejects.toThrow(/too many sign-up attempts/i)
  })
})
