// Audit-only HTTP deletion ledger with persisted before/after fingerprints.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import pg from 'pg'

const base = process.env.E2E_BASE_URL
const output = process.env.LESSON3_AUDIT_RESULT_FILE
const fixturePath = process.env.LESSON3_AUDIT_FIXTURE_FILE
assert.equal(base, 'http://app:3000')
assert(output && fixturePath)
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))

const db = new pg.Client({
  connectionString: process.env.DATABASE_URI,
  application_name: 'lesson3-audit-c31-deletion-ledger',
})
const tokens = {}
const created = new Set()
const ledger = []
let before
let after
let failure = null

async function api(method, route, actor, body) {
  const form = body instanceof FormData
  const response = await fetch(new URL(route, base), {
    method,
    headers: {
      ...(actor && tokens[actor] ? { Authorization: `JWT ${tokens[actor]}` } : {}),
      ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  const text = await response.text()
  let parsed = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { text: text.slice(0, 500) }
  }
  return { status: response.status, body: parsed }
}

async function fingerprints() {
  const tables = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'lesson_bundle_versions%' OR tablename IN ('lesson_plans','subjects','subject_grades','favorites','edit_recovery','edit_recoveries')) ORDER BY tablename",
  )
  const state = {}
  for (const { tablename } of tables.rows) {
    assert(/^[a-z_]+$/.test(tablename))
    state[tablename] = (
      await db.query(`SELECT md5(to_jsonb(t)::text) AS hash FROM "${tablename}" t ORDER BY hash`)
    ).rows.map((row) => row.hash)
  }
  return state
}

function sameFingerprints(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function exists(id) {
  const result = await db.query(
    'SELECT EXISTS (SELECT 1 FROM lesson_bundle_versions WHERE id=$1) AS present',
    [id],
  )
  return result.rows[0].present
}

async function login(actor) {
  const account = fixture.accounts[actor]
  const response = await api('POST', '/api/users/login', null, {
    email: account.email,
    password: fixture.password,
  })
  assert.equal(response.status, 200, `${actor} login`)
  tokens[actor] = response.body.token
}

async function saveCandidate(sourceId, actor, label) {
  const loaded = await api('GET', `/api/lesson-bundle-versions/${sourceId}?depth=0`, actor)
  assert.equal(loaded.status, 200, `${actor} source read`)
  loaded.body.lessons[0].overview = `ZZ_AUDIT_C31_LEDGER_${label}`
  const form = new FormData()
  form.set('data', JSON.stringify(loaded.body))
  const response = await api(
    'POST',
    `/api/lesson-bundle-versions/${sourceId}/save-as-new`,
    actor,
    form,
  )
  assert.equal(response.status, 200, `${actor} save-as-new`)
  assert(Number.isInteger(Number(response.body.id)))
  const id = Number(response.body.id)
  created.add(id)
  return id
}

async function deleteAttempt(id, actor, expected, label) {
  const response = await api('DELETE', `/api/lesson-bundle-versions/${id}`, actor)
  const present = await exists(id)
  assert.equal(response.status, expected, `${label} status`)
  ledger.push({
    label,
    id,
    actor: actor ?? 'anonymous',
    status: response.status,
    presentAfter: present,
  })
  return response.status
}

try {
  await db.connect()
  const marker = await db.query(
    "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
  )
  assert.equal(marker.rows[0].marker, fixture.run)
  for (const actor of [
    'siteAdmin',
    'teacher',
    'editorA',
    'editorAPeer',
    'editorB',
    'subjectAdminA',
    'subjectAdminB',
  ]) {
    await login(actor)
  }

  before = await fingerprints()

  // Scope A: author may delete their own candidate; a peer and a plain Teacher may not.
  const ownA = await saveCandidate(fixture.plans.A.version, 'editorA', 'own-a')
  await deleteAttempt(ownA, 'editorAPeer', 403, 'editor peer cannot delete author-owned A')
  await deleteAttempt(ownA, 'editorA', 200, 'author editor deletes own A')

  // Subject Administrator may delete any candidate in the administered subject-grade.
  const subjectA = await saveCandidate(fixture.plans.A.version, 'editorA', 'subject-a')
  await deleteAttempt(subjectA, 'subjectAdminA', 200, 'subject administrator deletes scoped A')

  const teacherA = await saveCandidate(fixture.plans.A.version, 'editorA', 'teacher-a')
  await deleteAttempt(teacherA, 'teacher', 403, 'plain teacher cannot delete A')
  await deleteAttempt(teacherA, 'siteAdmin', 200, 'site administrator deletes A')

  // Subject Administrator A cannot delete a candidate in subject-grade B; B can.
  const subjectB = await saveCandidate(fixture.plans.B.version, 'editorB', 'subject-b')
  await deleteAttempt(
    subjectB,
    'subjectAdminA',
    403,
    'out-of-scope subject administrator cannot delete B',
  )
  await deleteAttempt(subjectB, 'subjectAdminB', 200, 'subject administrator deletes scoped B')

  const anonymous = await saveCandidate(fixture.plans.A.version, 'editorA', 'anonymous-a')
  await deleteAttempt(anonymous, null, 403, 'anonymous cannot delete candidate')

  // The immutable Official pointer remains undeletable even for Site Administrator.
  await deleteAttempt(
    fixture.plans.A.version,
    'siteAdmin',
    409,
    'site administrator cannot delete Official',
  )

  // Clean candidates left by refused attempts and prove every owned row is gone.
  for (const id of [...created]) {
    if (await exists(id)) await deleteAttempt(id, 'siteAdmin', 200, 'cleanup candidate')
  }
  after = await fingerprints()
  assert(
    sameFingerprints(before, after),
    'persisted fingerprint vectors differ after ledger cleanup',
  )
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
} finally {
  try {
    for (const id of [...created]) {
      if (await exists(id)) {
        const response = await api('DELETE', `/api/lesson-bundle-versions/${id}`, 'siteAdmin')
        if (![200, 404].includes(response.status))
          throw new Error(`cleanup ${id}: ${response.status}`)
      }
    }
    if (before && !after) after = await fingerprints()
  } catch (error) {
    failure = `${failure || ''}\nCleanup: ${error}`
  }
  await db.end()
  await writeFile(
    output,
    JSON.stringify(
      {
        ledger,
        before,
        after,
        fingerprintEqual: before && after ? sameFingerprints(before, after) : false,
        failure,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
  console.log(
    JSON.stringify({
      attempts: ledger.length,
      fingerprintEqual: before && after ? sameFingerprints(before, after) : false,
      passed: !failure,
    }),
  )
  if (failure) {
    console.error(failure)
    process.exitCode = 1
  }
}
