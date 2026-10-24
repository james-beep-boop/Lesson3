import assert from 'node:assert/strict'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from '@playwright/test'
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
const base = auditBaseURL()
const collectionSlugs = [
  'lesson-plans',
  'lesson-bundle-versions',
  'subjects',
  'subject-grades',
  'users',
  'favorites',
  'messages',
  'edit-recovery',
  'discussion-topics',
  'discussion-replies',
  'discussion-participation',
  'payload-kv',
  'payload-jobs',
  'payload-locked-documents',
  'payload-preferences',
  'payload-migrations',
]
const pages = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/explore',
  '/guide',
  '/messages',
  '/discuss',
  '/discuss/new',
  `/lessons/${fixture.plans.A.plan}`,
  `/lessons/${fixture.plans.A.plan}/compare`,
  `/discuss/${fixture.topic ?? 2147483000}`,
  '/admin',
  `/admin/collections/lesson-bundle-versions/${fixture.plans.A.version}`,
  '/admin/collections/users',
  '/admin/globals/system-settings',
]

for (const actor of auditActors) {
  test(`${auditActorLabels[actor]}: login, routes, API reads and observed requests`, async ({
    browser,
  }, info) => {
    const dir = path.join(output, info.project.name)
    await mkdir(path.join(dir, 'states'), { recursive: true, mode: 0o700 })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const events: Array<{ method: string; path: string; type: string; status: number }> = []
    const errors: Array<{ route: string; kind: string; message: string }> = []
    const visits: Array<{
      requested: string
      final: string
      status: number | null
      links: string[]
    }> = []
    const reads: Array<{ method: string; path: string; status: number }> = []
    const outbound = new Set<string>()
    context.on('response', (response) => {
      const request = response.request()
      if (
        new URL(response.url()).origin === base &&
        ['fetch', 'xhr', 'document'].includes(request.resourceType())
      ) {
        events.push({
          method: request.method(),
          path: safeURL(response.url()),
          type: request.resourceType(),
          status: response.status(),
        })
      }
    })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== base && ['http:', 'https:'].includes(url.protocol)) {
        outbound.add(url.hostname)
        await route.abort('blockedbyclient')
      } else await route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', (error) =>
      errors.push({ route: safeURL(page.url()), kind: 'pageerror', message: error.message }),
    )
    const api = auditAPI(context.request)
    let proof: 'anonymous' | 'refused-unverified' | 'signed-in' = 'anonymous'
    try {
      if (actor !== 'anonymous') {
        const account = fixture.accounts[actor]
        await page.goto(`${base}/login`)
        await page.locator('input[type="email"]').fill(account.email)
        await page.locator('input[type="password"]').fill(fixture.password)
        const response = page.waitForResponse(
          (value) =>
            value.url().endsWith('/api/users/login') && value.request().method() === 'POST',
        )
        await page.locator('button[type="submit"]').click()
        const login = await response
        if (account.verified) {
          expect(login.status()).toBe(200)
          await page.waitForURL(`${base}/`)
          await expect(page.locator('.app-header')).toBeVisible()
          const me = await api('GET', '/api/users/me')
          const body = (await me.json()) as { user?: { id: number } }
          expect(body.user?.id).toBe(account.id)
          proof = 'signed-in'
        } else {
          expect(login.status()).toBe(403)
          const me = await api('GET', '/api/users/me')
          const body = (await me.json()) as { user?: unknown }
          expect(body.user ?? null).toBeNull()
          proof = 'refused-unverified'
        }
      }
      const state = path.join(dir, 'states', `${actor}.json`)
      await context.storageState({ path: state })
      await chmod(state, 0o600)
      await page.close()
      for (const route of pages) {
        // Give each route its own tab: late admin-to-login redirects cannot cancel the next visit.
        const visitPage = await context.newPage()
        visitPage.on('pageerror', (error) =>
          errors.push({ route, kind: 'pageerror', message: error.message }),
        )
        try {
          const response = await visitPage.goto(`${base}${route}`, {
            waitUntil:
              proof !== 'signed-in' && route.startsWith('/admin') ? 'commit' : 'domcontentloaded',
          })
          if (proof !== 'signed-in' && route.startsWith('/admin')) {
            // This baseline redirects unauthenticated admin documents client-side after commit.
            // Wait for the observed final page before extracting links; never swallow an abort.
            await visitPage.waitForURL((url) => url.origin === base && url.pathname === '/login', {
              waitUntil: 'domcontentloaded',
            })
          }
          if (response && response.status() >= 500)
            errors.push({ route, kind: 'http-5xx', message: `HTTP ${response.status()}` })
          const links = await visitPage
            .locator('a[href]')
            .evaluateAll((items) => items.map((item) => (item as HTMLAnchorElement).href))
          const internal = [
            ...new Set(
              links
                .filter((href) => {
                  try {
                    return new URL(href).origin === base
                  } catch {
                    return false
                  }
                })
                .map(safeURL),
            ),
          ]
          visits.push({
            requested: route,
            final: safeURL(visitPage.url()),
            status: response?.status() ?? null,
            links: internal,
          })
        } catch (error) {
          // Keep raw diagnostic details private; continue to inventory the remaining routes.
          errors.push({
            route,
            kind: 'navigation',
            message: error instanceof Error ? error.message : String(error),
          })
        } finally {
          await visitPage.close()
        }
      }
      for (const slug of collectionSlugs) {
        const route = `/api/${slug}?limit=1&depth=0`
        const response = await api('GET', route)
        reads.push({ method: 'GET', path: safeURL(route), status: response.status() })
      }
      for (const route of [
        '/api/globals/system-settings',
        '/api/globals/payload-jobs-stats',
        '/api/access',
      ]) {
        const response = await api('GET', route)
        reads.push({ method: 'GET', path: route, status: response.status() })
      }
      for (const method of ['GET', 'POST'] as const) {
        const response = await api(
          method,
          '/api/graphql',
          method === 'POST' ? { query: '{ __schema { queryType { name } } }' } : undefined,
        )
        reads.push({ method, path: '/api/graphql', status: response.status() })
        expect(response.status(), 'GraphQL must remain unreachable').toBe(404)
      }
      assert.equal(
        errors.length,
        0,
        'Navigation errors are recorded privately and require reconciliation',
      )
      expect(visits.length).toBe(pages.length)
    } finally {
      const result = {
        actor,
        browser: info.project.name,
        proof,
        visits,
        reads,
        events,
        errors,
        outboundBlocked: [...outbound],
      }
      await writeFile(path.join(dir, `${actor}.json`), JSON.stringify(result, null, 2), {
        mode: 0o600,
      })
      await context.close()
    }
  })
}
