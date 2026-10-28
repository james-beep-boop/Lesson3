import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../../src/payload.config.js'
import { createUserVerified, deleteUserFixture } from '../helpers/fixtures.js'
import { url } from '../helpers/httpWire.js'
const payload = await getPayload({ config })
const email = `audit-${randomUUID()}@lesson3.local`
let id: number | undefined
let bootstrapId: number | undefined
try {
  if ((await payload.count({ collection: 'users', overrideAccess: true })).totalDocs === 0) {
    const admin = await createUserVerified(payload, {
      name: 'Audit bootstrap fixture',
      email: 'audit-bootstrap@lesson3.local',
      password: 'audit-bootstrap-only',
      roles: ['siteAdmin'],
    })
    bootstrapId = admin.id
  }
  const res = await fetch(url('/api/users'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Audit synthetic signup',
      email,
      password: 'audit-only-long-password',
      roles: ['siteAdmin'],
      assignments: [],
      _verified: true,
    }),
  })
  assert.equal(res.status, 201)
  const doc = (await res.json()) as { doc: { id: number } }
  id = doc.doc.id
  const stored = await payload.findByID({
    collection: 'users',
    id,
    overrideAccess: true,
    showHiddenFields: true,
    depth: 0,
  })
  assert.ok(!stored.roles?.includes('siteAdmin'))
  assert.notEqual(stored._verified, true)
  const mailbox = await fetch(
    `http://mail:8025/api/v1/search?query=${encodeURIComponent('to:' + email)}`,
  )
  assert.equal(mailbox.status, 200)
  const data = (await mailbox.json()) as { messages?: unknown[] }
  assert.ok((data.messages?.length ?? 0) > 0, 'verification message reached local capture')
  console.log(
    JSON.stringify({
      checks: [
        'anonymous signup cannot set siteAdmin',
        'anonymous signup cannot self-verify',
        'verification message reached local mail capture',
      ],
      passed: 3,
    }),
  )
} finally {
  if (id) await payload.delete({ collection: 'users', id, overrideAccess: true })
  if (bootstrapId) await deleteUserFixture(payload, bootstrapId)
  await payload.destroy()
}
