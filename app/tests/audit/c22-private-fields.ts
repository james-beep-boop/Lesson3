/** Bounded native-REST privacy probes on the marked synthetic target; no content writes. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

const file = process.env.LESSON3_AUDIT_FIXTURE_FILE
const output = process.env.LESSON3_AUDIT_RESULT_FILE
const base = process.env.E2E_BASE_URL
assert(file && output && base)
assert.equal(new URL(base).origin, 'http://app:3000')
const fixture = JSON.parse(await readFile(file, 'utf8')) as {
  run: string
  password: string
  accounts: Record<string, { id: number; email: string; verified: boolean }>
}
assert(fixture.run.startsWith('l3audit-'))
const target = fixture.accounts.siteAdmin
const results: Array<Record<string, unknown>> = []
const concerns: Array<Record<string, unknown>> = []

async function request(route: string, token?: string, data?: unknown) {
  const response = await fetch(new URL(route, base), {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(20_000),
    redirect: 'manual',
  })
  const text = await response.text()
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(text)
  } catch {
    // A non-JSON 404 is still a valid observation for the disabled GraphQL route.
  }
  return { status: response.status, body }
}

for (const actor of ['anonymous', ...Object.keys(fixture.accounts)]) {
  let token: string | undefined
  if (actor !== 'anonymous') {
    const user = fixture.accounts[actor]
    const login = await request('/api/users/login', undefined, {
      email: user.email,
      password: fixture.password,
    })
    assert.equal(login.status, user.verified ? 200 : 403)
    if (user.verified) {
      assert.equal(typeof login.body.token, 'string')
      token = login.body.token as string
    }
  }
  const authentication = token ? 'verified login' : 'no authenticated session'
  const detail = await request(`/api/users/${target.id}?depth=0`, token)
  const projectedEmail = Object.hasOwn(detail.body, 'email')
  results.push({
    actor,
    authentication,
    probe: 'target projection',
    status: detail.status,
    projectedEmail,
  })
  if (actor !== 'siteAdmin' && projectedEmail)
    concerns.push({ actor, probe: 'other user email projected' })

  for (const [label, key, value] of [
    ['matching email equality', 'where[email][equals]', target.email],
    ['nonmatching email equality', 'where[email][equals]', 'nonexistent-audit@lesson3.local'],
    ['matching email prefix', 'where[email][like]', `${target.email.slice(0, 5)}%`],
    ['privileged role filter', 'where[roles][contains]', 'siteAdmin'],
  ]) {
    const query = new URLSearchParams({ [key]: value, depth: '0', limit: '20' })
    const response = await request(`/api/users?${query}`, token)
    const docs = Array.isArray(response.body.docs) ? response.body.docs : []
    const matchesTarget = docs.some((doc: { id?: number }) => doc.id === target.id)
    results.push({
      actor,
      authentication,
      probe: label,
      status: response.status,
      totalDocs: response.body.totalDocs,
      matchesTarget,
    })
  }

  for (const [label, route, data] of [
    ['GET GraphQL', '/api/graphql', undefined],
    ['POST introspection', '/api/graphql', { query: '{ __schema { queryType { name } } }' }],
  ] as const) {
    const response = await request(route, token, data)
    results.push({ actor, authentication, probe: label, status: response.status })
    if (response.status !== 404) concerns.push({ actor, probe: label, status: response.status })
  }
}

for (const actor of Object.keys(fixture.accounts).filter((actor) => actor !== 'siteAdmin')) {
  const matching = results.find((r) => r.actor === actor && r.probe === 'matching email equality')!
  const missing = results.find(
    (r) => r.actor === actor && r.probe === 'nonmatching email equality',
  )!
  if (matching.matchesTarget && matching.totalDocs !== missing.totalDocs)
    concerns.push({ actor, probe: 'hidden email equality changes result membership/count' })
}
await writeFile(output, JSON.stringify({ results, concerns }, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ probes: results.length, concerns }))
if (concerns.length) process.exitCode = 1
