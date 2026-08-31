/**
 * Fixture-heavy suites must not depend on the production-wide signup budget left by earlier specs.
 * Pin where the test-only headroom is allowed to live, and pin the production fallback as BEHAVIOUR,
 * so neither a script cleanup nor a "make it consistent" edit can move the real abuse limit.
 *
 * ⚑ THE SCRIPT ASSERTIONS ARE NEGATIVE, AND THAT IS DELIBERATE. `test.env` is loaded only by
 * `test:int`, which owns the private `lesson3_test` database. `test:http` and `test:e2e` seed through
 * the Local API into the database the RUNNING app serves from — on the Rock, per
 * `vitest.http.config.mts`, the LIVE `lesson3`. `rateLimit.ts`'s upsert sets `window_start`
 * unconditionally, so a 1 ms window in either of those runners makes the app's next signup observe a
 * differing window and RESET the real daily count to 1: the abuse limiter fails OPEN. A counter row
 * is shared state, so "test-only" env on a shared database is not test-only. Briefly shipped on
 * `codex/next-session-foundations` and caught in review before merge (2026-08-30) — CI could never
 * have caught it, because CI's `lesson3` is torn down with `docker compose down -v`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '../..')
const pkg = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const testEnv = readFileSync(resolve(appRoot, 'test.env'), 'utf8')
const controlledEnv = [
  'RATE_LIMIT_SIGNUP_MAX',
  'RATE_LIMIT_SIGNUP_WINDOW_MS',
  'RATE_LIMIT_SIGNUP_GLOBAL_MAX',
  'RATE_LIMIT_SIGNUP_GLOBAL_WINDOW_MS',
] as const
const originalEnv = Object.fromEntries(controlledEnv.map((name) => [name, process.env[name]]))

function setEnv(values: Partial<Record<(typeof controlledEnv)[number], string>>) {
  for (const name of controlledEnv) {
    const value = values[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

function countingRequest() {
  let count = 0
  return {
    payload: {
      db: {
        drizzle: {
          execute: async () => ({ rows: [{ count: ++count }] }),
        },
      },
    },
  } as never
}

afterEach(() => {
  setEnv(originalEnv)
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('fixture signup-limit configuration', () => {
  it('gives the isolated integration database deterministic test-only headroom', () => {
    expect(testEnv).toMatch(/^RATE_LIMIT_SIGNUP_GLOBAL_MAX=10000$/m)
    expect(testEnv).toMatch(/^RATE_LIMIT_SIGNUP_GLOBAL_WINDOW_MS=1$/m)
  })

  it('keeps the short window away from every runner that can reach a shared database', () => {
    // Not just the 1 ms window: a raised ceiling on a shared database is also wrong, because it lets
    // a test run spend budget the real deployment is counting on.
    for (const script of ['test:http', 'test:e2e'] as const) {
      expect(
        pkg.scripts[script],
        `${script} seeds into the app's own database — it must not carry signup-limiter overrides`,
      ).not.toMatch(/RATE_LIMIT_SIGNUP_GLOBAL_/)
    }
  })

  it('applies controlled global-signup configuration to the real limiter primitive', async () => {
    setEnv({ RATE_LIMIT_SIGNUP_GLOBAL_MAX: '2', RATE_LIMIT_SIGNUP_GLOBAL_WINDOW_MS: '60000' })
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(30_000)
    const { consumeRateLimit } = await import('../../src/lib/rateLimit.js')
    const req = countingRequest()

    await expect(consumeRateLimit(req, 'signupGlobal', 'all')).resolves.toEqual({
      ok: true,
      retryAfterSec: 0,
    })
    await expect(consumeRateLimit(req, 'signupGlobal', 'all')).resolves.toEqual({
      ok: true,
      retryAfterSec: 0,
    })
    await expect(consumeRateLimit(req, 'signupGlobal', 'all')).resolves.toEqual({
      ok: false,
      retryAfterSec: 30,
    })
  })

  it('leaves the production fallback at 100 signups per 24-hour window', async () => {
    setEnv({})
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(43_200_000)
    const { consumeRateLimit } = await import('../../src/lib/rateLimit.js')
    const req = countingRequest()

    for (let i = 0; i < 100; i++) {
      expect((await consumeRateLimit(req, 'signupGlobal', 'all')).ok).toBe(true)
    }
    await expect(consumeRateLimit(req, 'signupGlobal', 'all')).resolves.toEqual({
      ok: false,
      retryAfterSec: 43_200,
    })
  })

  it('routes anonymous user creation through the global signup bucket', async () => {
    setEnv({
      RATE_LIMIT_SIGNUP_MAX: '3',
      RATE_LIMIT_SIGNUP_WINDOW_MS: '60000',
      RATE_LIMIT_SIGNUP_GLOBAL_MAX: '1',
      RATE_LIMIT_SIGNUP_GLOBAL_WINDOW_MS: '60000',
    })
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(30_000)
    const { rateLimitAuthOperations } = await import('../../src/hooks/authRateLimit.js')

    await expect(
      rateLimitAuthOperations({
        args: { data: { email: 'new-teacher@example.com' } },
        operation: 'create',
        req: countingRequest(),
      } as never),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringMatching(/sign-ups are temporarily paused/i),
    })
  })
})
