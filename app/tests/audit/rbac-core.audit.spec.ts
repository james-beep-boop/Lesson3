import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test, expect, type APIRequestContext } from '@playwright/test'
import {
  auditActors,
  auditActorLabels,
  auditAPI,
  auditBaseURL,
  auditFixture,
  safeURL,
} from './client'

const fixture = auditFixture()
const output = process.env.LESSON3_AUDIT_ARTIFACT_DIR!
assert.equal(process.env.LESSON3_AUDIT_STORAGE_DIR, '/audit-states')
const storageState = (actor: string) => `/audit-states/chromium/states/${actor}.json`
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
let observer: APIRequestContext
let before: string
let source: Record<string, unknown>
async function fingerprint(): Promise<string> {
  const docs: unknown[] = []
  for (const route of [
    '/api/lesson-plans?depth=0&limit=100&sort=id',
    '/api/lesson-bundle-versions?depth=0&limit=100&sort=id',
    '/api/globals/system-settings',
  ]) {
    const response = await auditAPI(observer)('GET', route)
    expect(response.status()).toBe(200)
    const body = (await response.json()) as { totalDocs?: number; docs?: Record<string, unknown>[] }
    if (body.docs) {
      expect(body.totalDocs).toBe(2)
      expect(body.docs).toHaveLength(2)
      if (route.includes('bundle-versions'))
        source = body.docs.find((doc) => doc.id === fixture.plans.A.version)!
    }
    docs.push(body)
  }
  return createHash('sha256')
    .update(JSON.stringify(stable(docs)))
    .digest('hex')
}
test.beforeAll(async ({ playwright }) => {
  auditBaseURL()
  await mkdir(output, { recursive: true, mode: 0o700 })
  observer = await playwright.request.newContext({ storageState: storageState('siteAdmin') })
  const me = await auditAPI(observer)('GET', '/api/users/me')
  expect(((await me.json()) as { user?: { id: number } }).user?.id).toBe(
    fixture.accounts.siteAdmin.id,
  )
  before = await fingerprint()
  assert(source)
})
test.afterAll(async () => {
  if (!observer) return
  try {
    const after = await fingerprint()
    await writeFile(
      path.join(output, 'fingerprints.json'),
      JSON.stringify({ before, after, equal: before === after }),
      { mode: 0o600 },
    )
    expect(
      after,
      'Full native version/plan snapshots, Official pointers and settings must be unchanged',
    ).toBe(before)
  } finally {
    await observer.dispose()
  }
})

for (const actor of auditActors) {
  test(`Core authorization: ${auditActorLabels[actor]}`, async ({ playwright }) => {
    const context = await playwright.request.newContext({ storageState: storageState(actor) })
    const api = auditAPI(context)
    const results: Array<{ method: string; path: string; status: number }> = []
    const probe = async (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      route: string,
      data?: unknown,
    ) => {
      const response = await api(method, route, data)
      results.push({ method, path: safeURL(route), status: response.status() })
      return response
    }
    try {
      const verified = actor !== 'anonymous' && actor !== 'unverified'
      const me = await api('GET', '/api/users/me')
      expect(((await me.json()) as { user?: { id: number } }).user?.id ?? null).toBe(
        verified ? fixture.accounts[actor].id : null,
      )
      for (const scope of ['A', 'B']) {
        const version = fixture.plans[scope].version
        const patch = await probe('PATCH', `/api/lesson-bundle-versions/${version}`, {
          title: 'ZZ_AUDIT_FORBIDDEN_IN_PLACE',
        })
        // Native field validation can reject before the immutability hook. A denial's status
        // alone is not the invariant: afterAll separately compares complete stored snapshots.
        expect([400, 401, 403, 404]).toContain(patch.status())
        const deletion = await probe('DELETE', `/api/lesson-bundle-versions/${version}`)
        expect([400, 401, 403, 404, 409]).toContain(deletion.status())
        if (deletion.status() === 409) {
          const body = (await deletion.json()) as { errors?: Array<{ message?: string }> }
          expect(body.errors?.map((error) => error.message).join(' ')).toMatch(/Official/i)
        }
      }
      const planCreate = await probe('POST', '/api/lesson-plans', {
        title: 'ZZ_AUDIT_FORBIDDEN_CREATE',
        subjectGrade: fixture.scopes.A,
      })
      expect(planCreate.status()).toBe(403)
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = source
      const versionCreate = await probe('POST', '/api/lesson-bundle-versions', {
        ...content,
        semver: '99.0.0',
      })
      expect(versionCreate.status()).toBe(403)
      const recoveryRead = await probe('GET', '/api/edit-recovery?limit=1&depth=0')
      expect(recoveryRead.status()).toBe(403)
      const recoveryCreate = await probe('POST', '/api/edit-recovery', {
        user: fixture.accounts.editorA.id,
        sourceVersion: fixture.plans.A.version,
        lessonPlan: fixture.plans.A.plan,
        generation: 1,
        revision: 1,
        baseUpdatedAt: source.updatedAt,
        schemaVersion: 1,
        content: {},
      })
      expect(recoveryCreate.status()).toBe(403)
      const settings = await probe('POST', '/api/globals/system-settings', {
        features: { forumEnabled: false },
      })
      expect(settings.status()).toBe(403)
      // Populated role/grant targets prevent a vacuous privacy pass on a plain account.
      const otherKeys = verified
        ? ['siteAdmin', actor === 'subjectAdminB' ? 'subjectAdminA' : 'subjectAdminB'].filter(
            (key) => key !== actor,
          )
        : ['teacher']
      for (const key of otherKeys) {
        const other = fixture.accounts[key]
        const response = await probe(
          'GET',
          `/api/users/${other.id}?depth=3&select[name]=true&select[email]=true&select[roles]=true&select[assignments]=true`,
        )
        expect(response.status()).toBe(verified ? 200 : 403)
        if (verified) {
          const user = (await response.json()) as Record<string, unknown>
          expect(user.id).toBe(other.id)
          if (actor === 'siteAdmin') expect(user.email).toBe(other.email)
          else {
            expect(user).not.toHaveProperty('email')
            expect(user.roles ?? []).toEqual([])
            // Role managers have a separate assignment-read grant; Q04 retains its scope review.
            if (actor !== 'subjectAdminA' && actor !== 'subjectAdminB')
              expect(user.assignments ?? []).toEqual([])
          }
        }
      }
      if (verified) {
        const own = await probe('GET', `/api/users/${fixture.accounts[actor].id}?depth=0`)
        expect(own.status()).toBe(200)
        expect(((await own.json()) as { email?: string }).email).toBe(fixture.accounts[actor].email)
      }
    } finally {
      await writeFile(
        path.join(output, `${actor}.json`),
        JSON.stringify({ actor, results }, null, 2),
        { mode: 0o600 },
      )
      await context.dispose()
    }
  })
}
