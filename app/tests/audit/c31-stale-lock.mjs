// Audit-only native-lock freshness probe. It uses the trusted Local API to seed a lock, then ages
// the lock row through SQL before exercising the real version-delete endpoint over HTTP.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '../../src/payload.config.js'
import { minimalBundleContent } from '../helpers/fixtures.js'
import { drizzleOf, rowsOf } from '../helpers/db.js'

const base = process.env.E2E_BASE_URL
const fixtureFile = process.env.LESSON3_AUDIT_FIXTURE_FILE
const output = process.env.LESSON3_AUDIT_RESULT_FILE
assert.equal(base, 'http://app:3000')
assert(fixtureFile && output)
const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))
const payload = await getPayload({ config })
let candidate
let lock
let failure
const results = []

async function login(account) {
  const response = await fetch(new URL('/api/users/login', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: fixture.password }),
  })
  assert.equal(response.status, 200)
  return (await response.json()).token
}

async function removeIfPresent(collection, id) {
  if (!id) return
  await payload.delete({ collection, id, overrideAccess: true }).catch(() => undefined)
}

try {
  const marker = rowsOf(
    await drizzleOf(payload).execute(
      sql`SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()`,
    ),
  )[0]?.marker
  assert.equal(marker, fixture.run)
  const subjectAdminToken = await login(fixture.accounts.subjectAdminA)
  const source = await payload.findByID({
    collection: 'lesson-bundle-versions',
    id: fixture.plans.A.version,
    depth: 0,
    overrideAccess: true,
  })
  const content = minimalBundleContent()
  candidate = await payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      ...content,
      lessonPlan: fixture.plans.A.plan,
      subjectGrade: fixture.scopes.A,
      semver: '61.99.0',
      title: 'ZZ_AUDIT_C31_STALE_LOCK',
      author: fixture.accounts.subjectAdminA.id,
      sourceVersion: source.id,
      meta: { ...content.meta, subject: 'ZZ_AUDIT_C31_STALE_LOCK' },
    },
    overrideAccess: true,
  })
  lock = await payload.create({
    collection: 'payload-locked-documents',
    data: {
      document: { relationTo: 'lesson-bundle-versions', value: candidate.id },
      user: { relationTo: 'users', value: fixture.accounts.editorA.id },
    },
    overrideAccess: true,
  })
  const fresh = await fetch(new URL(`/api/lesson-bundle-versions/${candidate.id}`, base), {
    method: 'DELETE',
    headers: { Authorization: `JWT ${subjectAdminToken}` },
  })
  assert.equal(fresh.status, 423)
  results.push({ phase: 'fresh-lock', status: fresh.status, blocked: true })

  await drizzleOf(payload).execute(
    sql`UPDATE payload_locked_documents SET updated_at = NOW() - INTERVAL '10 minutes' WHERE id = ${lock.id}`,
  )
  const aged = rowsOf(
    await drizzleOf(payload).execute(
      sql`SELECT EXTRACT(EPOCH FROM (NOW() - updated_at)) AS age_seconds FROM payload_locked_documents WHERE id = ${lock.id}`,
    ),
  )[0]
  assert(Number(aged?.age_seconds) >= 599)
  const expired = await fetch(new URL(`/api/lesson-bundle-versions/${candidate.id}`, base), {
    method: 'DELETE',
    headers: { Authorization: `JWT ${subjectAdminToken}` },
  })
  assert.equal(expired.status, 200)
  results.push({
    phase: 'aged-lock',
    ageSeconds: Number(aged.age_seconds),
    status: expired.status,
    expired: true,
  })
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
} finally {
  await removeIfPresent('payload-locked-documents', lock?.id)
  await removeIfPresent('lesson-bundle-versions', candidate?.id)
  await writeFile(output, JSON.stringify({ results, failure, passed: !failure }, null, 2), {
    mode: 0o600,
  })
  console.log(JSON.stringify({ results, passed: !failure }))
  if (failure) {
    console.error(failure)
    process.exitCode = 1
  }
  process.exit(0)
}
