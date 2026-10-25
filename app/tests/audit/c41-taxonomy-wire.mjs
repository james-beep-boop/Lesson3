// Requires the narrowly conditional audit trigger installed in the marked disposable database.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

const base = process.env.E2E_BASE_URL
const output = process.env.LESSON3_AUDIT_RESULT_FILE
assert.equal(base, 'http://app:3000')
assert(output && process.env.LESSON3_AUDIT_FIXTURE_FILE && process.env.LESSON3_AUDIT_CORPUS_DIR)
const fixture = JSON.parse(await readFile(process.env.LESSON3_AUDIT_FIXTURE_FILE, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))
const source = JSON.parse(
  await readFile(`${process.env.LESSON3_AUDIT_CORPUS_DIR}/role-control.json`, 'utf8'),
)
const subject = 'ZZ_AUDIT_C41_Consented_Subject'
let token
const results = []
let failure
const collections = ['subjects', 'subject-grades', 'lesson-plans', 'lesson-bundle-versions']
async function api(method, route, data) {
  const form = data instanceof FormData
  const response = await fetch(new URL(route, base), {
    method,
    headers: {
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...(data && !form ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : form ? data : JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  })
  return { status: response.status, body: await response.json() }
}
async function snapshot() {
  const state = {}
  for (const collection of collections) {
    const response = await api('GET', `/api/${collection}?depth=0&limit=1000&sort=id`)
    assert.equal(response.status, 200)
    assert(response.body.totalDocs <= 1000)
    state[collection] = response.body.docs
  }
  return state
}
let before
async function cleanup() {
  if (!before) return
  const current = await snapshot()
  // Derive ownership only from the exact synthetic identity; never delete unrelated additions.
  const plans = new Set(
    current['lesson-bundle-versions']
      .filter((v) => v.meta?.substrand_id?.startsWith('991.c41.wire.'))
      .map((v) => v.lessonPlan),
  )
  for (const id of plans) assert.equal((await api('DELETE', `/api/lesson-plans/${id}`)).status, 200)
  const subjects = current.subjects.filter((s) => s.name === subject)
  for (const s of subjects) {
    assert(!before.subjects.some((original) => original.id === s.id))
    for (const sg of current['subject-grades'].filter((row) => row.subject === s.id)) {
      assert.equal((await api('DELETE', `/api/subject-grades/${sg.id}`)).status, 200)
    }
    assert.equal((await api('DELETE', `/api/subjects/${s.id}`)).status, 200)
  }
}
async function upload(mode, approvals = [{ subject, grade: 9 }]) {
  const form = new FormData()
  for (const [index, raw] of [structuredClone(source), structuredClone(source)].entries()) {
    raw.META.substrand_id = `991.c41.wire.${mode}.${index}`
    raw.META.titleDoc =
      mode === 'fault' && index === 1
        ? 'ZZ_AUDIT_C41_TX_FAIL'
        : `ZZ_AUDIT_C41_WIRE_${mode}_${index}`
    if (index === 1) {
      raw.META.subject = subject
      raw.META.grade = 9
    }
    form.append('files', new File([JSON.stringify(raw)], `${mode}-${index}.json`))
  }
  form.set('createTaxonomy', JSON.stringify(approvals))
  const response = await api('POST', '/api/lesson-plans/upload', form)
  results.push({ mode, ...response })
  return response
}
try {
  const account = fixture.accounts.siteAdmin
  const login = await api('POST', '/api/users/login', {
    email: account.email,
    password: fixture.password,
  })
  assert.equal(login.status, 200)
  token = login.body.token
  before = await snapshot()
  assert(!before.subjects.some((s) => s.name === subject))
  const approved = await upload('approved')
  assert.equal(approved.status, 200)
  assert.equal(approved.body.count, 2)
  assert.deepEqual(approved.body.created, [{ subject, grade: 9, newSubject: true }])
  const committed = await snapshot()
  for (const [collection, delta] of [
    ['subjects', 1],
    ['subject-grades', 1],
    ['lesson-plans', 2],
    ['lesson-bundle-versions', 2],
  ]) {
    assert.equal(committed[collection].length, before[collection].length + delta)
  }
  await cleanup()
  assert.deepEqual(await snapshot(), before)
  const fault = await upload('fault')
  assert.equal(fault.status, 500)
  // Check BEFORE cleanup: rollback itself must remove the first valid peer and new taxonomy.
  assert.deepEqual(
    await snapshot(),
    before,
    'actual PostgreSQL fault must roll back whole valid subset and taxonomy',
  )
  const health = await api('GET', '/api/users/me')
  assert.equal(health.status, 200)
  assert(health.body.user)
} catch (error) {
  failure = String(error instanceof Error ? error.stack : error)
} finally {
  try {
    await cleanup()
    assert.deepEqual(await snapshot(), before)
  } catch (error) {
    failure = `${failure || ''}\nCleanup: ${error}`
  }
  await writeFile(output, JSON.stringify({ results, failure, unchanged: !failure }, null, 2), {
    mode: 0o600,
  })
  console.log(
    JSON.stringify({
      cases: results.length,
      statuses: results.map((r) => r.status),
      passed: !failure,
    }),
  )
  if (failure) {
    console.error(failure)
    process.exitCode = 1
  }
}
