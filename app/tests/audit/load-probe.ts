/** Read-only load against the dedicated audit target; synthetic data is removed on exit. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { setupRoleFixture } from '../helpers/fixtures'
import { login, url } from '../helpers/httpWire'
const require = createRequire(import.meta.url)
type Result = {
  requests: { total: number; average: number }
  latency: { average: number; p99: number }
  errors: number
  timeouts: number
  non2xx: number
}
type Run = { stop: () => void }
const autocannon = require('/audit-tools/node_modules/autocannon') as (
  options: unknown,
  callback: (error: Error | null, result: Result) => void,
) => Run
assert.equal(
  process.env.AUDIT_EXCLUSIVE_TARGET,
  'ares-audit-20261028',
  'Exclusive audit target lock required',
)
const fx = await setupRoleFixture()
try {
  const token = await login(fx.users.teacher.email, fx.password)
  const cases: { name: string; path: string; headers: Record<string, string> }[] = [
    { name: 'anonymous login', path: '/login', headers: {} },
    { name: 'authenticated catalogue', path: '/', headers: { Cookie: `payload-token=${token}` } },
    {
      name: 'authenticated lesson',
      path: `/lessons/${fx.plan.id}`,
      headers: { Cookie: `payload-token=${token}` },
    },
    {
      name: 'authenticated plan API',
      path: '/api/lesson-plans?limit=10&depth=0',
      headers: { Authorization: `JWT ${token}` },
    },
  ]
  for (const target of cases)
    for (const connections of [1, 5, 10]) {
      const warm = await fetch(url(target.path), {
        headers: target.headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      })
      assert.equal(warm.status, 200, `${target.name} preflight must be a real 200`)
      let active: Run | undefined
      let healthFailed = false
      let checking = false
      const monitoring = setInterval(() => {
        if (checking) return
        checking = true
        void fetch(url('/login'), { signal: AbortSignal.timeout(5000) })
          .then((r) => {
            if (r.status !== 200) {
              healthFailed = true
              active?.stop()
            }
          })
          .catch(() => {
            healthFailed = true
            active?.stop()
          })
          .finally(() => {
            checking = false
          })
      }, 1000)
      let result: Result
      try {
        result = await new Promise<Result>((resolve, reject) => {
          active = autocannon(
            {
              url: url(target.path),
              headers: target.headers,
              connections,
              duration: 8,
              pipelining: 1,
              timeout: 5,
              overallRate: 80,
            },
            (error, result) => (error ? reject(error) : resolve(result)),
          )
        })
      } finally {
        clearInterval(monitoring)
      }
      console.log(
        JSON.stringify({
          scenario: target.name,
          connections,
          durationSeconds: 8,
          rateCap: 80,
          requests: result.requests.total,
          requestsPerSecond: result.requests.average,
          latencyMs: { mean: result.latency.average, p99: result.latency.p99 },
          errors: result.errors,
          timeouts: result.timeouts,
          non2xx: result.non2xx,
          healthFailed,
        }),
      )
      assert.equal(healthFailed, false, 'Stop load if health monitoring fails')
      assert.equal(
        result.errors + result.timeouts + result.non2xx,
        0,
        'Record unexpected load failures without weakening expectations',
      )
    }
} finally {
  await fx.teardown()
}
process.exit(0)
