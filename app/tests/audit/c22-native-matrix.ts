/** Native write/privacy matrix. Only synthetic favorites may be created, then deleted. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
  plans: Record<string, { plan: number; version: number }>
  scopes: Record<string, number>
}
assert(fixture.run.startsWith('l3audit-'))
const results: Array<Record<string, unknown>> = []
const mismatches: Array<Record<string, unknown>> = []
const tokens: Record<string, string | undefined> = {}
let before = ''
let after = ''
const snapshots: Record<string, Record<string, unknown>> = {}

async function request(method: string, route: string, actor: string, data?: unknown) {
  const response = await fetch(new URL(route, base), {
    method,
    headers: {
      ...(tokens[actor] ? { Authorization: `JWT ${tokens[actor]}` } : {}),
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
    // Some native not-found responses are HTML.
  }
  return { status: response.status, body }
}
function check(actor: string, probe: string, actual: unknown, expected: unknown) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected)
  const row = { actor, probe, actual, expected, passed }
  results.push(row)
  if (!passed) mismatches.push(row)
}
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
        )
      : value
async function fingerprint() {
  const records = []
  for (const { plan, version } of Object.values(fixture.plans)) {
    const p = await request('GET', `/api/lesson-plans/${plan}?depth=0`, 'siteAdmin')
    const v = await request('GET', `/api/lesson-bundle-versions/${version}?depth=0`, 'siteAdmin')
    assert.equal(p.status, 200)
    assert.equal(v.status, 200)
    snapshots[String(version)] = v.body
    records.push({ version: v.body, plan: p.body })
  }
  return createHash('sha256')
    .update(JSON.stringify(stable(records)))
    .digest('hex')
}

try {
  for (const [actor, user] of Object.entries(fixture.accounts)) {
    const login = await request('POST', '/api/users/login', actor, {
      email: user.email,
      password: fixture.password,
    })
    assert.equal(login.status, user.verified ? 200 : 403)
    if (user.verified) {
      assert.equal(typeof login.body.token, 'string')
      tokens[actor] = login.body.token as string
    }
  }
  before = await fingerprint()
  for (const actor of ['anonymous', ...Object.keys(fixture.accounts)]) {
    const authenticated = Boolean(tokens[actor])
    for (const slug of [
      'users',
      'subjects',
      'subject-grades',
      'lesson-plans',
      'lesson-bundle-versions',
    ]) {
      const response = await request('GET', `/api/${slug}?limit=10&depth=0`, actor)
      check(actor, `read ${slug}`, response.status, authenticated ? 200 : 403)
    }
    const createPlan = await request('POST', '/api/lesson-plans', actor, {
      title: 'ZZ_AUDIT_Forbidden_native_create',
      subjectGrade: fixture.scopes.A,
    })
    check(actor, 'native plan create denied', createPlan.status, 403)
    const createVersion = await request('POST', '/api/lesson-bundle-versions', actor, {
      lessonPlan: fixture.plans.A.plan,
      subjectGrade: fixture.scopes.A,
      title: 'ZZ_AUDIT_Forbidden_native_create',
      semver: '99.0.0',
    })
    check(actor, 'native version create denied', createVersion.status, 403)
    for (const [scope, { version }] of Object.entries(fixture.plans)) {
      const attempted = structuredClone(snapshots[String(version)])
      const lessons = attempted.lessons as Array<Record<string, unknown>>
      lessons[0].overview = 'ZZ_AUDIT_Forbidden_native_mutation'
      const patch = await request(
        'PATCH',
        `/api/lesson-bundle-versions/${version}`,
        actor,
        attempted,
      )
      check(actor, `immutable PATCH scope ${scope}`, patch.status, 403)
      const deletion = await request('DELETE', `/api/lesson-bundle-versions/${version}`, actor)
      const canReachRetentionGuard =
        actor === 'siteAdmin' || actor === (scope === 'A' ? 'subjectAdminA' : 'subjectAdminB')
      check(
        actor,
        `Official version survives DELETE scope ${scope}`,
        deletion.status,
        canReachRetentionGuard ? 409 : 403,
      )
    }
    const statistics = await request('POST', '/api/globals/payload-jobs-stats', actor, {
      stats: [],
    })
    check(actor, 'job statistics API write denied', statistics.status, 403)
    const jobRead = await request('GET', '/api/payload-jobs?limit=1', actor)
    check(actor, 'job read restricted', jobRead.status, actor === 'siteAdmin' ? 200 : 403)
    const jobCreate = await request('POST', '/api/payload-jobs', actor, {
      taskSlug: 'expireEditRecovery',
      input: {},
    })
    check(actor, 'native job create denied', jobCreate.status, 403)
    const lockCreate = await request('POST', '/api/payload-locked-documents', actor, {
      document: { relationTo: 'lesson-bundle-versions', value: fixture.plans.A.version },
      user: { relationTo: 'users', value: fixture.accounts.teacher.id },
    })
    check(actor, 'native lock create denied', lockCreate.status, 403)
    const migrations = await request('GET', '/api/payload-migrations', actor)
    check(actor, 'migration collection REST disabled', migrations.status, 501)
    assert.equal(await fingerprint(), before, 'Retained versions and Official plans changed')

    const favorite = await request('POST', '/api/favorites', actor, {
      user: fixture.accounts.teacher.id,
      version: fixture.plans.A.version,
    })
    check(actor, 'favorite create', favorite.status, authenticated ? 201 : 403)
    if (favorite.status === 201) {
      const doc = favorite.body.doc as { id: number; user: number | { id: number } }
      assert(doc?.id)
      const owner = typeof doc.user === 'object' ? doc.user.id : doc.user
      check(actor, 'favorite ignores forged owner', owner, fixture.accounts[actor].id)
      const peer = actor === 'teacherPeer' ? 'teacher' : 'teacherPeer'
      const disclosure = await request('GET', `/api/favorites/${doc.id}?depth=0`, peer)
      check(actor, 'peer cannot read favorite', disclosure.status, 404)
      const cleanup = await request('DELETE', `/api/favorites/${doc.id}`, actor)
      check(actor, 'favorite owner cleanup', cleanup.status, 200)
    }
  }
  after = await fingerprint()
  assert.equal(after, before)
} finally {
  await writeFile(output, JSON.stringify({ results, mismatches, before, after }, null, 2), {
    mode: 0o600,
  })
  console.log(
    JSON.stringify({ checks: results.length, mismatches, fingerprintsEqual: before === after }),
  )
}
if (mismatches.length) process.exitCode = 1
