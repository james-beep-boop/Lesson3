import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
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
const base = auditBaseURL()
const output = process.env.LESSON3_AUDIT_ARTIFACT_DIR!
const states = process.env.LESSON3_AUDIT_STORAGE_DIR
assert.equal(states, '/audit-states', 'Use the dedicated read-only private state mount')
const groups = [
  'users,users.accounts,users.access,curriculum',
  'plans,plans.mine,plans.drafts,plans.upload,plans.delete,plans.versions,plans.repair',
  'system,system.features,system.deployment,system.backups',
]

for (const actor of auditActors.filter(
  (value) => value !== 'anonymous' && value !== 'unverified',
)) {
  test(`Manage panels: ${auditActorLabels[actor]}`, async ({ browser }, info) => {
    const dir = path.join(output, info.project.name)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const context = await browser.newContext({
      storageState: path.join(states!, info.project.name, 'states', `${actor}.json`),
      viewport: { width: 1280, height: 900 },
    })
    const events: Array<{ method: string; path: string; status: number }> = []
    const errors: string[] = []
    const outbound = new Set<string>()
    const visits: Array<{ panels: string; final: string; expanded: string[]; links: string[] }> = []
    context.on('response', (response) => {
      const request = response.request()
      if (
        new URL(response.url()).origin === base &&
        ['fetch', 'xhr', 'document'].includes(request.resourceType())
      ) {
        events.push({
          method: request.method(),
          path: safeURL(response.url()),
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
    try {
      const me = await auditAPI(context.request)('GET', '/api/users/me')
      expect(me.status()).toBe(200)
      expect(((await me.json()) as { user?: { id: number } }).user?.id).toBe(
        fixture.accounts[actor].id,
      )
      for (const panels of groups) {
        const page = await context.newPage()
        page.on('pageerror', (error) => errors.push(error.message))
        try {
          const response = await page.goto(`${base}/admin?open=${encodeURIComponent(panels)}`)
          expect(response?.status()).toBeLessThan(500)
          // Let hydration and lazy read effects settle. This crawl never submits panel actions.
          await page.waitForLoadState('networkidle')
          const expanded = await page
            .locator('.lp-accordion__trigger[aria-expanded="true"]')
            .allTextContents()
          const links = await page
            .locator('a[href]')
            .evaluateAll((items) => items.map((item) => (item as HTMLAnchorElement).href))
          visits.push({
            panels,
            final: safeURL(page.url()),
            expanded,
            links: [...new Set(links.filter((href) => new URL(href).origin === base).map(safeURL))],
          })
        } finally {
          await page.close()
        }
      }
      expect(visits).toHaveLength(groups.length)
      expect(errors).toEqual([])
    } finally {
      await writeFile(
        path.join(dir, `${actor}.json`),
        JSON.stringify(
          {
            actor,
            browser: info.project.name,
            visits,
            events,
            errors,
            outboundBlocked: [...outbound],
          },
          null,
          2,
        ),
        { mode: 0o600 },
      )
      await context.close()
    }
  })
}
