/** Provision one synthetic discussion for representative route crawling; reconcile by submission key. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { auditBaseURL, auditFixture } from './client'

const fixtureFile = process.env.LESSON3_AUDIT_FIXTURE_FILE!
const fixture = auditFixture() as ReturnType<typeof auditFixture> & { c20TopicKey?: string }
const base = auditBaseURL()
const login = await fetch(`${base}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: fixture.accounts.teacher.email, password: fixture.password }),
})
assert.equal(login.status, 200)
const auth = (await login.json()) as { token?: string }
assert(auth.token)
const headers = { Authorization: `JWT ${auth.token}`, 'Content-Type': 'application/json' }
fixture.c20TopicKey ??= randomUUID()
await writeFile(fixtureFile, JSON.stringify(fixture, null, 2), { mode: 0o600 })
const search = new URL(`${base}/api/discussion-topics`)
search.searchParams.set('where[submissionKey][equals]', fixture.c20TopicKey)
search.searchParams.set('depth', '0')
const existing = await fetch(search, { headers })
assert.equal(existing.status, 200)
const found = (await existing.json()) as { docs: Array<{ id: number }> }
assert(found.docs.length <= 1)
if (found.docs.length) fixture.topic = found.docs[0].id
else {
  const response = await fetch(`${base}/api/discussion-topics`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'ZZ_AUDIT_C20_Route_fixture',
      body: 'Synthetic discussion for isolated route inventory.',
      submissionKey: fixture.c20TopicKey,
    }),
  })
  assert.equal(response.status, 201, 'Do not blindly retry an uncertain discussion create')
  const created = (await response.json()) as { doc?: { id: number } }
  assert(created.doc?.id)
  fixture.topic = created.doc.id
}
await writeFile(fixtureFile, JSON.stringify(fixture, null, 2), { mode: 0o600 })
assert(JSON.parse(await readFile(fixtureFile, 'utf8')).topic)
console.log('C20 representative synthetic discussion is ready.')
