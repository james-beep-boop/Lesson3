import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { url } from '../helpers/httpWire'
const payload = await getPayload({ config })
const ids: number[] = []
try {
  const results = []
  for (const [kind, password] of [
    ['ordinary', 'audit-password-control'],
    ['all whitespace', '        '],
  ] as const) {
    const email = `audit-${randomUUID()}@lesson3.local`
    const created = await fetch(url('/api/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Audit password fixture', email, password }),
    })
    if (created.status !== 201) {
      results.push({ kind, createStatus: created.status })
      continue
    }
    const { doc } = (await created.json()) as { doc: { id: number } }
    ids.push(doc.id)
    await payload.update({
      collection: 'users',
      id: doc.id,
      data: { _verified: true },
      overrideAccess: true,
    })
    const login = await fetch(url('/api/users/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    results.push({ kind, createStatus: 201, verified: true, loginStatus: login.status })
  }
  console.log(JSON.stringify({ source: '6e75a173e822e4c4be42821b0a4af48ca457bd36', results }))
  assert.ok(
    results.every((r) => r.createStatus !== 201 || r.loginStatus === 200),
    'An accepted and approved password must work for sign-in',
  )
} finally {
  for (const id of ids) await payload.delete({ collection: 'users', id, overrideAccess: true })
  await payload.destroy()
}
process.exit(0)
