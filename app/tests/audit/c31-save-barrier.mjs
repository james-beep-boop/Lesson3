// Actual database lock barrier around HTTP saves, with immutable-row fingerprints.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import pg from 'pg'

const base = process.env.E2E_BASE_URL
const output = process.env.LESSON3_AUDIT_RESULT_FILE
assert.equal(base, 'http://app:3000')
assert(output && process.env.LESSON3_AUDIT_FIXTURE_FILE && process.env.LESSON3_AUDIT_CORPUS_DIR)
const fixture = JSON.parse(await readFile(process.env.LESSON3_AUDIT_FIXTURE_FILE, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))
const db = new pg.Client({
  connectionString: process.env.DATABASE_URI,
  application_name: 'lesson3-audit-c31-barrier',
})
const tokens = {}
const results = []
let planId
let original
let failure
async function api(method, route, actor = 'siteAdmin', data) {
  const form = data instanceof FormData
  const response = await fetch(new URL(route, base), {
    method,
    headers: {
      ...(tokens[actor] ? { Authorization: `JWT ${tokens[actor]}` } : {}),
      ...(data && !form ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : form ? data : JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  })
  return { status: response.status, body: await response.json() }
}
async function fingerprints() {
  const names = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'lesson_bundle_versions%' OR tablename IN ('lesson_plans','subjects','subject_grades')) ORDER BY tablename",
  )
  const state = {}
  for (const { tablename } of names.rows) {
    assert(/^[a-z_]+$/.test(tablename))
    state[tablename] = (
      await db.query(`SELECT md5(to_jsonb(t)::text) AS hash FROM "${tablename}" t ORDER BY hash`)
    ).rows.map((r) => r.hash)
  }
  return state
}
function retained(before, after) {
  for (const [table, hashes] of Object.entries(before)) {
    const remaining = [...after[table]]
    for (const hash of hashes) {
      const at = remaining.indexOf(hash)
      assert(at >= 0, `${table}: historical row changed or disappeared`)
      remaining.splice(at, 1)
    }
  }
}
async function save(actor, source, label) {
  const data = structuredClone(source)
  data.lessons[0].overview = `ZZ_AUDIT_C31_${label}`
  const form = new FormData()
  form.set('data', JSON.stringify(data))
  return api('POST', `/api/lesson-bundle-versions/${source.id}/save-as-new`, actor, form)
}
async function race(label, actors, source, expectedSemvers) {
  let requests = []
  let blocked = []
  let barrierFailure
  await db.query('BEGIN')
  try {
    await db.query('SELECT id FROM lesson_plans WHERE id=$1 FOR UPDATE', [planId])
    const holder = (await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const settled = [false, false]
    requests = actors.map((actor, index) =>
      save(actor, source, `${label}_${index}`).finally(() => {
        settled[index] = true
      }),
    )
    // Attach rejection handlers immediately; preserve original promises for the final assertion.
    requests.forEach((request) => request.catch(() => undefined))
    const deadline = Date.now() + 10000
    do {
      blocked = (
        await db.query(
          `WITH RECURSIVE blocked(pid) AS (
        SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))
        UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid))
      ) SELECT pid,wait_event_type,wait_event FROM pg_stat_activity WHERE pid IN (SELECT pid FROM blocked)`,
          [holder],
        )
      ).rows
      if (blocked.length >= 2) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    } while (Date.now() < deadline && !settled.some(Boolean))
    assert.equal(blocked.length, 2, `${label}: both HTTP requests must reach the held lock chain`)
    assert.deepEqual(settled, [false, false])
    assert(blocked.every((row) => row.wait_event_type === 'Lock'))
  } catch (error) {
    barrierFailure = error
  } finally {
    await db.query('ROLLBACK')
  }
  const outcomes = await Promise.allSettled(requests)
  if (barrierFailure) throw barrierFailure
  const responses = outcomes.map((outcome) => {
    if (outcome.status === 'rejected') throw outcome.reason
    return outcome.value
  })
  for (const response of responses) assert.equal(response.status, 200)
  const versions = []
  for (const response of responses) {
    const loaded = await api('GET', `/api/lesson-bundle-versions/${response.body.id}?depth=0`)
    assert.equal(loaded.status, 200)
    versions.push(loaded.body)
  }
  assert.deepEqual(versions.map((version) => version.semver).sort(), expectedSemvers)
  versions.forEach((version, index) => {
    const actor = actors[index] === 'editorASecond' ? 'editorA' : actors[index]
    assert.equal(version.author, fixture.accounts[actor].id)
    assert.equal(version.sourceVersion, source.id)
    assert.equal(version.lessons[0].overview, `ZZ_AUDIT_C31_${label}_${index}`)
  })
  const plan = await api('GET', `/api/lesson-plans/${planId}?depth=0`)
  assert.equal(plan.body.officialVersion, source.id)
  results.push({
    label,
    actors,
    blocked,
    statuses: responses.map((r) => r.status),
    semvers: versions.map((v) => v.semver),
    historicalRowsRetained: true,
  })
}
try {
  await db.connect()
  const marker = await db.query(
    "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
  )
  assert.equal(marker.rows[0].marker, fixture.run)
  for (const actor of ['siteAdmin', 'editorA', 'editorAPeer', 'editorASecond']) {
    const account = fixture.accounts[actor === 'editorASecond' ? 'editorA' : actor]
    const login = await api('POST', '/api/users/login', actor, {
      email: account.email,
      password: fixture.password,
    })
    assert.equal(login.status, 200)
    tokens[actor] = login.body.token
  }
  assert.notEqual(
    tokens.editorA,
    tokens.editorASecond,
    'same teacher must use distinct authenticated sessions',
  )
  original = await fingerprints()
  const raw = JSON.parse(
    await readFile(`${process.env.LESSON3_AUDIT_CORPUS_DIR}/role-control.json`, 'utf8'),
  )
  raw.META.substrand_id = '991.c31.barrier'
  raw.META.titleDoc = 'ZZ_AUDIT_C31_BARRIER'
  const form = new FormData()
  form.append('files', new File([JSON.stringify(raw)], 'barrier.json'))
  const uploaded = await api('POST', '/api/lesson-plans/upload', 'siteAdmin', form)
  assert.equal(uploaded.status, 200)
  assert.equal(uploaded.body.count, 1)
  planId = uploaded.body.bundles[0].id
  assert.equal(uploaded.body.bundles[0].subjectGrade, fixture.scopes.A)
  const plan = await api('GET', `/api/lesson-plans/${planId}?depth=0`)
  const stored = await api(
    'GET',
    `/api/lesson-bundle-versions/${plan.body.officialVersion}?depth=0`,
  )
  assert.equal(stored.status, 200)
  const history = await fingerprints()
  await race('two-editors', ['editorA', 'editorAPeer'], stored.body, ['1.0.1', '1.0.2'])
  retained(history, await fingerprints())
  await race('two-sessions', ['editorA', 'editorASecond'], stored.body, ['1.0.3', '1.0.4'])
  retained(history, await fingerprints())
  const unique = await db.query(
    "SELECT indexdef FROM pg_indexes WHERE tablename='lesson_bundle_versions' AND indexdef LIKE 'CREATE UNIQUE INDEX%'",
  )
  assert(unique.rows.some((row) => /lesson_plan_id.*semver/.test(row.indexdef)))
  results.push({ uniqueIndexes: unique.rows })
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
} finally {
  try {
    await db.query('ROLLBACK')
    if (planId) assert.equal((await api('DELETE', `/api/lesson-plans/${planId}`)).status, 200)
    if (original) assert.deepEqual(await fingerprints(), original)
  } catch (error) {
    failure = `${failure || ''}\nCleanup: ${error}`
  }
  await db.end()
  await writeFile(output, JSON.stringify({ results, failure, unchanged: !failure }, null, 2), {
    mode: 0o600,
  })
  console.log(JSON.stringify({ races: results.filter((r) => r.label).length, passed: !failure }))
  if (failure) {
    console.error(failure)
    process.exitCode = 1
  }
}
