import assert from 'node:assert/strict'
import { setupRoleFixture, MARK } from '../helpers/fixtures'
import { login, url } from '../helpers/httpWire'
import { auditRawBundle } from './helpers/bundles'
const fx = await setupRoleFixture()
try {
  const victim = fx.users.siteAdmin
  const read = () =>
    fx.payload.findByID({
      collection: 'users',
      id: victim.id,
      overrideAccess: true,
      showHiddenFields: true,
      depth: 0,
    })
  const secretFields = ['resetPasswordToken', 'resetPasswordExpiration', 'salt', 'hash']
  const pick = (u: unknown) =>
    Object.fromEntries(secretFields.map((k) => [k, (u as Record<string, unknown>)[k] ?? null]))
  const before = pick(await read())
  const token = await login(fx.users.subjectAdmin.email, fx.password)
  const patch = await fetch(url(`/api/users/${victim.id}`), {
    method: 'PATCH',
    headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resetPasswordToken: 'audit-cannot-plant-reset-token',
      resetPasswordExpiration: new Date(Date.now() + 3600000).toISOString(),
      salt: 'audit-cannot-plant-salt',
      hash: 'audit-cannot-plant-hash',
    }),
  })
  assert.deepEqual(
    pick(await read()),
    before,
    'Subject administrators must not change native auth secrets',
  )
  console.log(
    JSON.stringify({
      check: 'native auth secret field attack',
      patchStatus: patch.status,
      allFourUnchanged: true,
    }),
  )
  const subject = MARK + 'x'.repeat(201 - MARK.length)
  const uploadToken = await login(fx.users.siteAdmin.email, fx.password)
  const upload = async (approval: boolean) => {
    const form = new FormData()
    form.append(
      'files',
      new Blob([JSON.stringify(auditRawBundle(subject, 10, '85.1', 'Audit long subject'))], {
        type: 'application/json',
      }),
      'audit-long-subject.json',
    )
    if (approval) form.append('createTaxonomy', JSON.stringify([{ subject, grade: 10 }]))
    return fetch(url('/api/lesson-plans/upload'), {
      method: 'POST',
      headers: { Authorization: `JWT ${uploadToken}` },
      body: form,
    })
  }
  const count = async () =>
    (
      await fx.payload.count({
        collection: 'subjects',
        where: { name: { equals: subject } },
        overrideAccess: true,
      })
    ).totalDocs
  assert.equal(await count(), 0)
  const preview = await upload(false)
  const body = (await preview.json()) as {
    needsConfirmation?: boolean
    missing?: { subject: string }[]
  }
  assert.equal(preview.status, 409)
  assert.equal(body.needsConfirmation, true)
  assert.ok(
    body.missing?.some((x) => x.subject === subject),
    'Preview must offer the same long subject',
  )
  assert.equal(await count(), 0, 'Preview must not write taxonomy')
  const confirmed = await upload(true)
  console.log(
    JSON.stringify({
      check: 'taxonomy approval length consistency',
      subjectLength: subject.length,
      previewStatus: preview.status,
      offered: true,
      approvalStatus: confirmed.status,
      createdSubjects: await count(),
    }),
  )
  assert.equal(
    confirmed.status,
    200,
    'A subject offered for confirmation must be accepted when approved',
  )
} finally {
  await fx.teardown()
}
process.exit(0)
