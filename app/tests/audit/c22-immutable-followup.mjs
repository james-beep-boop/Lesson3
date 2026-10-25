// Database-backed immutability follow-up; output and fixture stay in the private audit mount.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const fixture = JSON.parse(await readFile(process.env.LESSON3_AUDIT_FIXTURE_FILE, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))
const base = process.env.E2E_BASE_URL
assert.equal(new URL(base).origin, 'http://app:3000')
const rows = []
async function api(method, path, token, data) {
  const r = await fetch(new URL(path, base), {
    method,
    headers: {
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  return { status: r.status, body: await r.json() }
}
const digest = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
for (const [actor, scope] of [
  ['editorA', 'A'],
  ['subjectAdminA', 'B'],
  ['siteAdmin', 'A'],
]) {
  const user = fixture.accounts[actor]
  const login = await api('POST', '/api/users/login', undefined, {
    email: user.email,
    password: fixture.password,
  })
  assert.equal(login.status, 200)
  const token = login.body.token
  const id = fixture.plans[scope].version
  const path = `/api/lesson-bundle-versions/${id}`
  const source = await api('GET', path + '?depth=0', token)
  assert.equal(source.status, 200)
  const before = digest(source.body)
  const full = structuredClone(source.body)
  full.lessons[0].overview = 'ZZ_AUDIT_Valid_prose_update'
  for (const [probe, route, body] of [
    ['sparse title', path, { title: 'ZZ_AUDIT_Test' }],
    ['full prose snapshot', path, full],
    ['bulk full prose snapshot', `/api/lesson-bundle-versions?where[id][equals]=${id}`, full],
  ]) {
    const result = await api('PATCH', route, token, body)
    const after = await api('GET', path + '?depth=0', token)
    rows.push({
      actor,
      scope,
      probe,
      status: result.status,
      errors: result.body.errors,
      unchanged: before === digest(after.body),
    })
    assert.equal(before, digest(after.body))
  }
}
await writeFile('/audit-fixtures/c22-immutable-followup.json', JSON.stringify({ rows }, null, 2), {
  mode: 0o600,
})
console.log(JSON.stringify(rows))
