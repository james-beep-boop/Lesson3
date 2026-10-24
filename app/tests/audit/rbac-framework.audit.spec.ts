import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test, expect, type APIRequestContext } from '@playwright/test'
import {
  auditActors,
  auditActorLabels,
  auditAPI,
  auditBaseURL,
  auditFixture,
  safeURL,
  type AuditActor,
} from './client'

const fixture = auditFixture()
const output = process.env.LESSON3_AUDIT_ARTIFACT_DIR!
assert.equal(process.env.LESSON3_AUDIT_STORAGE_DIR, '/audit-states')
const verified = auditActors.filter((actor) => actor !== 'anonymous' && actor !== 'unverified')
const contexts = new Map<AuditActor, APIRequestContext>()
const journal: Record<string, unknown> = { run: randomUUID(), actions: [] }
const results: Array<{
  actor: string
  method: string
  path: string
  status: number
  label: string
}> = []
const save = async () =>
  writeFile(path.join(output, 'ledger.json'), JSON.stringify({ ...journal, results }, null, 2), {
    mode: 0o600,
  })
const record = async (key: string, value: unknown) => {
  journal[key] = value
  await save()
}
const probe = async (
  actor: AuditActor,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  route: string,
  data?: unknown,
  label = '',
) => {
  const context = contexts.get(actor)
  assert(context)
  const response = await auditAPI(context)(method, route, data)
  results.push({ actor, method, path: safeURL(route), status: response.status(), label })
  await save()
  return response
}
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, stable(v)]),
        )
      : value
let before: string
async function contentFingerprint() {
  const docs: unknown[] = []
  for (const route of [
    '/api/lesson-plans?depth=0&limit=100&sort=id',
    '/api/lesson-bundle-versions?depth=0&limit=100&sort=id',
    '/api/globals/system-settings',
  ]) {
    const response = await probe('siteAdmin', 'GET', route, undefined, 'content-fingerprint')
    expect(response.status()).toBe(200)
    const body = (await response.json()) as { docs?: unknown[]; totalDocs?: number }
    if (body.docs) {
      expect(body.totalDocs).toBe(2)
      expect(body.docs).toHaveLength(2)
    }
    docs.push(body)
  }
  return createHash('sha256')
    .update(JSON.stringify(stable(docs)))
    .digest('hex')
}
test.beforeAll(async ({ playwright }) => {
  auditBaseURL()
  await mkdir(path.join(output, 'states'), { recursive: true, mode: 0o700 })
  await save()
  for (const actor of auditActors) {
    const context = await playwright.request.newContext({
      storageState: `/audit-states/chromium/states/${actor}.json`,
    })
    contexts.set(actor, context)
    let me = await probe(actor, 'GET', '/api/users/me', undefined, 'identity')
    const expected =
      actor === 'anonymous' || actor === 'unverified' ? null : fixture.accounts[actor].id
    if (expected && ((await me.json()) as { user?: { id: number } }).user?.id !== expected) {
      // A single normal login renews expired fixture cookies; never retry a mutation automatically.
      const login = await probe(
        actor,
        'POST',
        '/api/users/login',
        { email: fixture.accounts[actor].email, password: fixture.password },
        'renew-expired-fixture-session',
      )
      expect(login.status()).toBe(200)
      me = await probe(actor, 'GET', '/api/users/me', undefined, 'identity-after-login')
    }
    expect(((await me.json()) as { user?: { id: number } }).user?.id ?? null).toBe(expected)
    const file = path.join(output, 'states', `${actor}.json`)
    await context.storageState({ path: file })
    await chmod(file, 0o600)
  }
  before = await contentFingerprint()
  await record('contentBefore', before)
})
test.afterAll(async () => {
  try {
    if (before) {
      const after = await contentFingerprint()
      await record('contentAfter', after)
      expect(
        after,
        'Native lesson/plan content, Official pointers and settings must be unchanged',
      ).toBe(before)
    }
  } finally {
    for (const context of contexts.values()) await context.dispose()
  }
})

for (const actor of auditActors) {
  test(`Native job, KV and disabled migration routes: ${auditActorLabels[actor]}`, async () => {
    const jobs = await probe(
      actor,
      'GET',
      '/api/payload-jobs?limit=1&depth=0',
      undefined,
      'native-job-read',
    )
    expect(jobs.status()).toBe(actor === 'siteAdmin' ? 200 : 403)
    const emptyQueue = `ZZ_AUDIT_${journal.run}`
    const run = await probe(
      actor,
      'GET',
      `/api/payload-jobs/run?queue=${emptyQueue}&disableScheduling=true&limit=1`,
      undefined,
      'empty-queue-run-gate',
    )
    expect(run.status()).toBe(actor === 'siteAdmin' ? 200 : 401)
    if (actor === 'siteAdmin')
      expect(((await run.json()) as { noJobsRemaining?: boolean }).noJobsRemaining).toBe(true)
    const denied = [
      [
        'POST',
        '/api/payload-jobs',
        {
          taskSlug: 'expireEditRecovery',
          queue: emptyQueue,
          input: {},
          waitUntil: '2099-01-01T00:00:00.000Z',
        },
      ],
      ['PATCH', '/api/payload-jobs?where[id][equals]=2147483000', { queue: emptyQueue }],
      ['DELETE', '/api/payload-jobs?where[id][equals]=2147483000', undefined],
      ['GET', '/api/payload-kv?limit=1', undefined],
      ['POST', '/api/payload-kv', { key: emptyQueue, data: { audit: true } }],
      ['PATCH', '/api/payload-kv?where[key][equals]=ZZ_AUDIT', { data: { audit: true } }],
      ['DELETE', '/api/payload-kv?where[key][equals]=ZZ_AUDIT', undefined],
    ] as const
    for (const [method, route, body] of denied) {
      expect((await probe(actor, method, route, body, 'closed-native-collection')).status()).toBe(
        403,
      )
    }
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE'] as const) {
      expect(
        (
          await probe(
            actor,
            method,
            '/api/payload-migrations',
            method === 'POST' || method === 'PATCH' ? { name: emptyQueue, batch: 999 } : undefined,
            'disabled-migrations',
          )
        ).status(),
      ).toBe(501)
    }
  })
}

for (const actor of verified) {
  test(`Preferences ownership and positive controls: ${auditActorLabels[actor]}`, async () => {
    const other: AuditActor = actor === 'teacher' ? 'teacherPeer' : 'teacher'
    const key = `ZZ_AUDIT_${randomUUID()}`
    const created: Array<{ actor: AuditActor; key: string }> = []
    await record(`preferences-${actor}`, { key, plannedOwners: [actor, other] })
    const value = { auditOwner: actor, run: journal.run }
    const own = async () => {
      const response = await probe(
        actor,
        'GET',
        `/api/payload-preferences/${key}`,
        undefined,
        'own-preference',
      )
      expect(response.status()).toBe(200)
      expect(((await response.json()) as { value?: unknown }).value).toEqual(value)
    }
    try {
      const create = await probe(
        actor,
        'POST',
        `/api/payload-preferences/${key}`,
        { value, user: { relationTo: 'users', value: fixture.accounts[other].id } },
        'preference-custom-create-owner-spoof',
      )
      expect(create.status()).toBe(200)
      const doc = ((await create.json()) as { doc: { id: number; user: { value: number } } }).doc
      created.push({ actor, key })
      await record(`preferences-created-${actor}`, doc.id)
      expect(doc.user.value).toBe(fixture.accounts[actor].id)
      await own()
      const foreign = await probe(
        other,
        'GET',
        `/api/payload-preferences/${key}`,
        undefined,
        'foreign-preference-key-read',
      )
      expect(foreign.status()).toBe(200)
      expect(((await foreign.json()) as { value: unknown }).value).toBeNull()
      const createOther = await probe(
        other,
        'POST',
        `/api/payload-preferences/${key}`,
        { value: { auditOwner: other } },
        'same-key-separate-owner',
      )
      expect(createOther.status()).toBe(200)
      const otherDoc = ((await createOther.json()) as { doc: { id: number } }).doc
      created.push({ actor: other, key })
      await record(`preferences-foreign-created-${actor}`, otherDoc.id)
      expect(otherDoc.id).not.toBe(doc.id)
      const patch = await probe(
        other,
        'PATCH',
        `/api/payload-preferences/${doc.id}`,
        { value: { forged: true } },
        'foreign-native-preference-patch',
      )
      expect([403, 404]).toContain(patch.status())
      const bulk = await probe(
        other,
        'DELETE',
        `/api/payload-preferences?where[id][equals]=${doc.id}`,
        undefined,
        'foreign-native-preference-bulk-delete',
      )
      expect([200, 403]).toContain(bulk.status())
      await own()
      if (actor !== 'siteAdmin') {
        const adminRead = await probe(
          'siteAdmin',
          'GET',
          `/api/payload-preferences/${key}`,
          undefined,
          'no-site-admin-preference-read-bypass',
        )
        expect(adminRead.status()).toBe(200)
        expect(((await adminRead.json()) as { value: unknown }).value).toBeNull()
      }
      const rawKey = `${key}_raw`
      const raw = await probe(
        actor,
        'POST',
        '/api/payload-preferences',
        { key: rawKey, value, user: { relationTo: 'users', value: fixture.accounts[other].id } },
        'native-preference-owner-stamp',
      )
      expect(raw.status()).toBe(201)
      const rawDoc = (
        (await raw.json()) as { doc: { id: number; user: { value: number | { id: number } } } }
      ).doc
      created.push({ actor, key: rawKey })
      await record(`preferences-raw-created-${actor}`, rawDoc.id)
      const owner = typeof rawDoc.user.value === 'object' ? rawDoc.user.value.id : rawDoc.user.value
      expect(owner).toBe(fixture.accounts[actor].id)
      const update = await probe(
        actor,
        'PATCH',
        `/api/payload-preferences/${rawDoc.id}`,
        {
          value: { auditOwner: actor, updated: true },
          user: { relationTo: 'users', value: fixture.accounts[other].id },
        },
        'native-preference-own-update-stamp',
      )
      expect(update.status()).toBe(200)
      const read = await probe(
        actor,
        'GET',
        `/api/payload-preferences/${rawKey}`,
        undefined,
        'native-updated-preference-readable-by-owner',
      )
      expect(((await read.json()) as { value: unknown }).value).toEqual({
        auditOwner: actor,
        updated: true,
      })
    } finally {
      for (const item of created) {
        const deleted = await probe(
          item.actor,
          'DELETE',
          `/api/payload-preferences/${item.key}`,
          undefined,
          'cleanup-known-preference',
        )
        expect(deleted.status()).toBe(200)
      }
      await record(`preferences-cleaned-${actor}`, true)
    }
  })
}

test('Observe cross-user native lock control with a synthetic global name', async () => {
  const globalSlug = `ZZ_AUDIT_${randomUUID()}`
  await record('lock-plan', { globalSlug, caller: 'teacher', claimedOwner: 'siteAdmin' })
  let id: number | undefined
  try {
    const response = await probe(
      'teacher',
      'POST',
      '/api/payload-locked-documents',
      { globalSlug, user: { relationTo: 'users', value: fixture.accounts.siteAdmin.id } },
      'lock-claim-another-user',
    )
    await record('lock-create-status', response.status())
    if (response.status() !== 201) {
      expect([401, 403, 404]).toContain(response.status())
      return
    }
    const doc = (
      (await response.json()) as { doc: { id: number; user: { value: number | { id: number } } } }
    ).doc
    id = doc.id
    await record('lock-created-id', id)
    const claimed = typeof doc.user.value === 'object' ? doc.user.value.id : doc.user.value
    await record('lock-forged-owner-persisted', claimed === fixture.accounts.siteAdmin.id)
    const patch = await probe(
      'teacherPeer',
      'PATCH',
      `/api/payload-locked-documents/${id}`,
      { globalSlug: `${globalSlug}_other` },
      'unrelated-teacher-lock-update',
    )
    await record('lock-peer-update-status', patch.status())
    const read = await probe(
      'siteAdmin',
      'GET',
      `/api/payload-locked-documents/${id}?depth=0`,
      undefined,
      'verify-lock-peer-effect',
    )
    expect(read.status()).toBe(200)
    await record(
      'lock-peer-update-persisted',
      ((await read.json()) as { globalSlug: string }).globalSlug === `${globalSlug}_other`,
    )
    const deletion = await probe(
      'teacherPeer',
      'DELETE',
      `/api/payload-locked-documents/${id}`,
      undefined,
      'unrelated-teacher-lock-delete',
    )
    await record('lock-peer-delete-status', deletion.status())
    if (deletion.status() === 200) id = undefined
  } finally {
    if (id !== undefined)
      expect(
        (
          await probe(
            'siteAdmin',
            'DELETE',
            `/api/payload-locked-documents/${id}`,
            undefined,
            'cleanup-known-lock',
          )
        ).status(),
      ).toBe(200)
    await record('lock-cleaned', true)
  }
})

test('A baseline teacher cannot write system job statistics', async () => {
  const route = '/api/globals/payload-jobs-stats'
  const read = await probe('siteAdmin', 'GET', route, undefined, 'job-stats-baseline')
  expect(read.status()).toBe(200)
  const baseline = (await read.json()) as { stats?: unknown }
  await record('job-stats-baseline', baseline)
  const stats =
    baseline.stats && typeof baseline.stats === 'object' && !Array.isArray(baseline.stats)
      ? (baseline.stats as Record<string, unknown>)
      : {}
  const marker = randomUUID()
  await record('job-stats-write-plan', { marker, restoreStats: baseline.stats ?? null })
  let writeStatus: number | undefined
  try {
    const write = await probe(
      'teacher',
      'POST',
      route,
      { stats: { ...stats, auditProbe: marker } },
      'teacher-job-stats-write',
    )
    writeStatus = write.status()
    await record('job-stats-write-status', writeStatus)
    const after = await probe('siteAdmin', 'GET', route, undefined, 'job-stats-write-readback')
    expect(after.status()).toBe(200)
    const body = (await after.json()) as { stats?: { auditProbe?: string } }
    await record('job-stats-marker-persisted', body.stats?.auditProbe === marker)
  } finally {
    if (writeStatus !== undefined && writeStatus >= 200 && writeStatus < 300) {
      const restore = await probe(
        'siteAdmin',
        'POST',
        route,
        { stats: baseline.stats ?? null },
        'restore-job-stats-values',
      )
      expect(restore.status()).toBe(200)
      const restored = await probe(
        'siteAdmin',
        'GET',
        route,
        undefined,
        'verify-job-stats-restoration',
      )
      expect(restored.status()).toBe(200)
      expect(((await restored.json()) as { stats?: unknown }).stats ?? null).toEqual(
        baseline.stats ?? null,
      )
      await record('job-stats-values-restored', true)
    }
  }
  expect(
    writeStatus,
    'System scheduling metadata is outside baseline Teacher authority; review a persisted write as a candidate',
  ).toBe(403)
})
