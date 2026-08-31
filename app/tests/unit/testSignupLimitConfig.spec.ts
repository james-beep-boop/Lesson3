/**
 * Fixture-heavy suites must not depend on the production-wide signup budget left by earlier specs.
 * Pin each test runner's explicit ceiling and the unchanged production fallback together so a future
 * script cleanup cannot quietly restore order-dependent failures—or raise the real abuse limit.
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
  it('gives every fixture-heavy runner deterministic test-only headroom', () => {
    expect(testEnv).toMatch(/^RATE_LIMIT_SIGNUP_GLOBAL_MAX=10000$/m)
    expect(testEnv).toMatch(/^RATE_LIMIT_SIGNUP_GLOBAL_WINDOW_MS=1$/m)
    expect(pkg.scripts['test:e2e']).toContain('RATE_LIMIT_SIGNUP_GLOBAL_MAX=10000')
    expect(pkg.scripts['test:e2e']).toContain('RATE_LIMIT_SIGNUP_GLOBAL_WINDOW_MS=1')
    expect(pkg.scripts['test:http']).toContain('RATE_LIMIT_SIGNUP_GLOBAL_MAX=10000')
    expect(pkg.scripts['test:http']).toContain('RATE_LIMIT_SIGNUP_GLOBAL_WINDOW_MS=1')
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
