/** Message-create reference rules over REST, against the migration-only production database. */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'
import { relId } from '../../src/lib/relId'
import { versionReferenceLabel } from '../../src/lib/lessonReference'

const BASE = process.env.E2E_BASE_URL ?? 'http://app:3000'
let fx: RoleFixture
const tokens: Partial<Record<RoleKey, string>> = {}
let originalId: number
let originalLabel: string

const post = (role: RoleKey | undefined, data: Record<string, unknown>) =>
  fetch(`${BASE}/api/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(role ? { Authorization: `JWT ${tokens[role]}` } : {}),
    },
    body: JSON.stringify({
      recipient: fx.users.teacher.id,
      body: `${MARK}Reference wire`,
      ...data,
    }),
  })

beforeAll(async () => {
  fx = await setupRoleFixture()
  for (const role of ['teacher', 'editor', 'subjectAdmin', 'siteAdmin'] as const) {
    const response = await fetch(`${BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fx.users[role].email, password: fx.password }),
    })
    expect(response.status).toBe(200)
    tokens[role] = (await response.json()).token
  }
  const saved = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.0.1',
      title: `${MARK}Saved reference`,
      sourceVersion: fx.version.id,
      ...minimalBundleContent(),
    } as never,
  })
  originalLabel = versionReferenceLabel(saved)
  const original = await fx.payload.create({
    collection: 'messages',
    overrideAccess: true,
    data: {
      sender: fx.users.teacher.id,
      recipient: fx.users.editor.id,
      body: `${MARK}Original reference`,
      lessonPlan: fx.plan.id,
      version: saved.id,
    },
  })
  originalId = original.id
  await fx.payload.delete({
    collection: 'lesson-bundle-versions',
    id: saved.id,
    overrideAccess: true,
  })
})
afterAll(async () => {
  await fx?.teardown()
})

describe('message reference authority', () => {
  it('anonymous create is refused and writes nothing', async () => {
    const before = await fx.payload.count({ collection: 'messages', overrideAccess: true })
    expect((await post(undefined, { replyTo: originalId, versionLabel: 'forged' })).status).toBe(
      403,
    )
    expect(await fx.payload.count({ collection: 'messages', overrideAccess: true })).toEqual(before)
  })

  it.each([
    ['Teacher', 'teacher'],
    ['Teacher with editing access', 'editor'],
    ['Subject-grade administrator', 'subjectAdmin'],
    ['Site administrator', 'siteAdmin'],
  ] as const)(
    '%s can link a readable version; a supplied label is ignored',
    async (_name, role) => {
      const response = await post(role, {
        lessonPlan: fx.plan.id,
        version: fx.version.id,
        versionLabel: 'forged',
      })
      expect(response.status).toBe(201)
      const { doc } = await response.json()
      expect(doc.versionLabel).toBe(versionReferenceLabel(fx.version))
      expect(relId(doc.version)).toBe(fx.version.id)
    },
  )

  it('whole-lesson messages and replies have no version label, even when one is supplied', async () => {
    const response = await post('teacher', {
      recipient: fx.users.editor.id,
      lessonPlan: fx.plan.id,
      versionLabel: 'forged',
    })
    expect(response.status).toBe(201)
    const { doc } = await response.json()
    expect(doc.versionLabel).toBeNull()
    expect(relId(doc.version)).toBeNull()
    const reply = await post('editor', { replyTo: doc.id, versionLabel: 'forged' })
    expect(reply.status).toBe(201)
    const { doc: replyDoc } = await reply.json()
    expect(replyDoc.versionLabel).toBeNull()
    expect(relId(replyDoc.version)).toBeNull()
    expect(relId(replyDoc.lessonPlan)).toBe(fx.plan.id)
  })

  it('the recipient replies with the original deleted-version label and server-chosen recipient', async () => {
    const response = await post('editor', {
      replyTo: originalId,
      recipient: fx.users.siteAdmin.id,
      lessonPlan: 999999999,
      version: 999999999,
      versionLabel: 'forged',
    })
    expect(response.status).toBe(201)
    const { doc } = await response.json()
    expect(doc.versionLabel).toBe(originalLabel)
    expect(relId(doc.version)).toBeNull()
    expect(relId(doc.lessonPlan)).toBe(fx.plan.id)
    expect(relId(doc.recipient)).toBe(fx.users.teacher.id)
    expect(doc.replyTo).toBeUndefined()
  })

  it.each([
    ['original sender', 'teacher', 403],
    ['unrelated user', 'subjectAdmin', 404],
    ['Site administrator', 'siteAdmin', 404],
  ] as const)(
    'the %s cannot use another recipient’s message as a reply source',
    async (_name, role, status) => {
      const before = await fx.payload.count({ collection: 'messages', overrideAccess: true })
      expect((await post(role, { replyTo: originalId })).status).toBe(status)
      expect(await fx.payload.count({ collection: 'messages', overrideAccess: true })).toEqual(
        before,
      )
    },
  )

  it('a missing original is refused without writing a reply', async () => {
    const before = await fx.payload.count({ collection: 'messages', overrideAccess: true })
    expect((await post('editor', { replyTo: 999999999 })).status).toBe(404)
    expect(await fx.payload.count({ collection: 'messages', overrideAccess: true })).toEqual(before)
  })

  it('unavailable or mismatched versions are refused without writing a message', async () => {
    const before = await fx.payload.count({ collection: 'messages', overrideAccess: true })
    for (const data of [
      { lessonPlan: fx.plan.id, version: 999999999 },
      { lessonPlan: 999999999, version: fx.version.id },
    ]) {
      const response = await post('teacher', data)
      expect(response.status).toBe(400)
      expect(JSON.stringify(await response.json())).toContain(
        'must belong to the linked lesson plan',
      )
    }
    expect(await fx.payload.count({ collection: 'messages', overrideAccess: true })).toEqual(before)
  })
})
