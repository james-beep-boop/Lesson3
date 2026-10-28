import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { createUserVerified } from '../helpers/fixtures'
import { url } from '../helpers/httpWire'
const payload = await getPayload({ config })
try {
  const email = process.env.AUDIT_EMAIL
  const password = process.env.AUDIT_PASSWORD
  assert.ok(email && password, 'Private fixture credentials required')
  if (process.argv.includes('--seed'))
    await createUserVerified(payload, {
      name: 'Audit reset fixture',
      email,
      password,
      roles: ['siteAdmin'],
    })
  const user = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    overrideAccess: true,
    depth: 0,
  })
  assert.equal(user.totalDocs, 1)
  const result = await fetch(url('/api/users/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(result.status, 200)
  const body = (await result.json()) as { token?: string }
  assert.ok(body.token)
  console.log(JSON.stringify({ fixtureRows: 1, loginStatus: result.status }))
} finally {
  await payload.destroy()
}

process.exit(0)
