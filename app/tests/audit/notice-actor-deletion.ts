import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { ingestItems } from '../../src/ingest'
import { officialUpdateNotice } from '../../src/lib/aresReleasePresentation'
import { relId } from '../../src/lib/relId'
import { createUserVerified, deleteUserFixture } from '../helpers/fixtures'
import { auditRawBundle } from './helpers/bundles'
const payload = await getPayload({ config })
const marker = `AUDIT_${randomUUID()}`
let subjectId: number | undefined
let gradeId: number | undefined
let planId: number | undefined
let actorId: number | undefined
let keeperId: number | undefined
try {
  const actor = await createUserVerified(payload, {
    name: 'Audit human actor',
    email: `${marker.toLowerCase()}-actor@lesson3.local`,
    password: 'audit-only-human-actor',
    roles: ['siteAdmin'],
  })
  actorId = actor.id
  const keeper = await createUserVerified(payload, {
    name: 'Audit keeper',
    email: `${marker.toLowerCase()}-keeper@lesson3.local`,
    password: 'audit-only-keeper',
    roles: ['siteAdmin'],
  })
  keeperId = keeper.id
  const subject = await payload.create({
    collection: 'subjects',
    data: { name: marker },
    overrideAccess: true,
  })
  subjectId = subject.id
  const grade = await payload.create({
    collection: 'subject-grades',
    data: { subject: subject.id, grade: 10 },
    overrideAccess: true,
  })
  gradeId = grade.id
  for (const title of ['Initial', 'Revision']) {
    const r = await ingestItems(payload, [
      { name: 'audit.json', extract: () => auditRawBundle(marker, 10, '83.1', title) },
    ])
    planId = r[0].id
  }
  const versions = (
    await payload.find({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: planId } },
      sort: '-id',
      overrideAccess: true,
      depth: 0,
      pagination: false,
    })
  ).docs
  const official = versions[0]
  await payload.update({
    collection: 'lesson-plans',
    id: planId!,
    data: { officialVersion: official.id },
    overrideAccess: true,
    user: actor,
  })
  const before = await payload.findByID({
    collection: 'lesson-plans',
    id: planId!,
    depth: 0,
    overrideAccess: true,
  })
  assert.equal(relId(before.officialChangedBy), actor.id)
  assert.equal(officialUpdateNotice(before, official, versions), null)
  await payload.delete({ collection: 'users', id: actor.id, overrideAccess: false, user: keeper })
  actorId = undefined
  const after = await payload.findByID({
    collection: 'lesson-plans',
    id: planId!,
    depth: 0,
    overrideAccess: true,
  })
  assert.equal(after.officialChangedBy, null)
  assert.equal(after.officialChangedAt, before.officialChangedAt)
  const notice = officialUpdateNotice(after, official, versions)
  console.log(
    JSON.stringify({
      source: '6e75a173e822e4c4be42821b0a4af48ca457bd36',
      humanChangeBeforeDeletion: { actorRecorded: true, notice: false },
      afterActorDeletion: { actor: null, changedAtPreserved: true, notice: Boolean(notice) },
    }),
  )
  assert.equal(
    notice,
    null,
    'A recorded human change must not become a system-change notice when its actor is deleted',
  )
} finally {
  if (planId) await payload.delete({ collection: 'lesson-plans', id: planId, overrideAccess: true })
  if (gradeId)
    await payload.delete({ collection: 'subject-grades', id: gradeId, overrideAccess: true })
  if (subjectId)
    await payload.delete({ collection: 'subjects', id: subjectId, overrideAccess: true })
  if (actorId) await deleteUserFixture(payload, actorId)
  if (keeperId) await deleteUserFixture(payload, keeperId)
  await payload.destroy()
}
process.exit(0)
