/** Bounded auth probes. Run under the target lock, restoring its synthetic dump between modes. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

const file = process.env.LESSON3_AUDIT_FIXTURE_FILE
const output = process.env.LESSON3_AUDIT_RESULT_FILE
const base = process.env.E2E_BASE_URL
const mode = process.env.LESSON3_AUDIT_AUTH_MODE
assert(file && output && base && (mode === 'target' || mode === 'global'))
assert.equal(new URL(base).origin, 'http://app:3000')
const fixture = JSON.parse(await readFile(file, 'utf8')) as {
  run: string
  password: string
  accounts: Record<string, { email: string }>
}
assert(fixture.run.startsWith('l3audit-'))
const results: Record<string, unknown> = { mode, concurrencyCap: mode === 'global' ? 4 : 1 }
async function call(route: string, data?: unknown, token?: string) {
  const r = await fetch(new URL(route, base), {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `JWT ${token}` } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(15_000),
  })
  let body: Record<string, unknown> = {}
  try {
    body = (await r.json()) as Record<string, unknown>
  } catch {
    // The health page is HTML.
  }
  return { status: r.status, retryAfter: r.headers.get('retry-after'), body }
}
const login = (email: string, password: string) => call('/api/users/login', { email, password })
const safe = (r: Awaited<ReturnType<typeof call>>) => ({
  status: r.status,
  retryAfter: r.retryAfter,
  messages: Array.isArray(r.body.errors)
    ? r.body.errors.map((e: { message?: string }) => e.message)
    : [],
})
try {
  const teacher = await login(fixture.accounts.teacher.email, fixture.password)
  const admin = await login(fixture.accounts.siteAdmin.email, fixture.password)
  results.before = { teacher: safe(teacher), siteAdmin: safe(admin) }
  assert.equal(teacher.status, 200)
  assert.equal(admin.status, 200)
  assert.equal(typeof teacher.body.token, 'string')
  const absent = await login('absent-audit@invalid.example.test', 'wrong-audit-password')
  const known = await login(fixture.accounts.teacher.email, 'wrong-audit-password')
  const unverified = await login(fixture.accounts.unverified.email, 'wrong-audit-password')
  results.enumerationControls = {
    absent: safe(absent),
    verified: safe(known),
    unverified: safe(unverified),
  }

  const started = Date.now()
  const statuses: Record<string, number> = {}
  const count = mode === 'global' ? 1005 : 20
  const deadline = started + 120_000
  let next = 0
  async function worker() {
    while (next < count) {
      const index = next++
      assert(Date.now() < deadline, 'Finite auth probe deadline exceeded')
      const email =
        mode === 'global'
          ? `global-audit-${index}@invalid.example.test`
          : fixture.accounts.teacher.email
      const response = await login(email, 'wrong-audit-password')
      statuses[response.status] = (statuses[response.status] ?? 0) + 1
      if (index % 100 === 0) assert.equal((await call('/login')).status, 200)
    }
  }
  await Promise.all(Array.from({ length: mode === 'global' ? 4 : 1 }, worker))
  results.attack = { attempted: count, statuses, durationMs: Date.now() - started }
  const teacherAfter = await login(fixture.accounts.teacher.email, fixture.password)
  const adminAfter = await login(fixture.accounts.siteAdmin.email, fixture.password)
  const existingSession = await call('/api/users/me', undefined, teacher.body.token as string)
  results.after = {
    teacher: safe(teacherAfter),
    siteAdmin: safe(adminAfter),
    existingSessionStatus: existingSession.status,
    existingSessionHasUser: Boolean(existingSession.body.user),
  }
  assert.equal(teacherAfter.status, 429)
  assert.equal(adminAfter.status, mode === 'global' ? 429 : 200)
  assert.equal(existingSession.status, 200)
  assert(existingSession.body.user)
  if (mode === 'global') {
    const reset = await call('/api/users/forgot-password', {
      email: 'absent-reset@invalid.example.test',
    })
    results.independentForgotPasswordBucket = safe(reset)
    assert.equal(reset.status, 200)
  }
} finally {
  await writeFile(output, JSON.stringify(results, null, 2), { mode: 0o600 })
  console.log(JSON.stringify(results))
}
