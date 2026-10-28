import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test, expect, type Page } from '@playwright/test'
import { sql } from '@payloadcms/db-postgres'
import {
  setupRoleFixture,
  setForumEnabled,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'
import { loginAs, E2E_BASE as BASE } from '../helpers/e2e'
import { createTopicAs, clearPostingCaps } from '../helpers/discussions'
import { drizzleOf } from '../helpers/db'
const require = createRequire(import.meta.url)
type AxeResult = {
  violations: {
    id: string
    impact: string | null
    description: string
    nodes: { target: unknown; failureSummary?: string }[]
  }[]
}
type AxeRunner = { withTags: (tags: string[]) => AxeRunner; analyze: () => Promise<AxeResult> }
const { default: AxeBuilder } = require('/audit-tools/node_modules/@axe-core/playwright') as {
  default: new (options: { page: Page }) => AxeRunner
}
let fx: RoleFixture
let forumWas: boolean | undefined
const artifact = '/audit-output/browser-artifacts'
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  forumWas =
    (await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).features
      ?.forumEnabled ?? undefined
  await setForumEnabled(fx.payload, true)
  await mkdir(artifact, { recursive: true })
})
test.afterAll(async () => {
  if (fx) {
    await clearPostingCaps(fx.payload, Object.values(fx.users))
    await setForumEnabled(fx.payload, forumWas ?? false)
    await fx.teardown()
  }
})

test('audit: title search has its own data and works in this browser', async ({ page }) => {
  const title = `${fx.plan.id} Audit independent search`
  await createTopicAs(fx.payload, fx.users.teacher, { title, body: 'Audit search fixture' })
  await loginAs(page, fx, 'teacher')
  await page.goto(`${BASE}/discuss?q=${encodeURIComponent(title)}`)
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
  await page.goto(`${BASE}/discuss?q=audit-no-match-${Date.now()}`)
  await expect(page.getByText(/No discussion titles match/)).toBeVisible()
})

test('audit: after a displayed new thread, paging and an uncertain reply preserve one post', async ({
  page,
}) => {
  const title = `Audit stable thread ${fx.plan.id}`
  await loginAs(page, fx, 'teacher')
  await page.goto(`${BASE}/discuss/new`)
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Post', { exact: true }).fill('Audit body')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const id = Number(new URL(page.url()).pathname.split('/').pop())
  expect(Number.isSafeInteger(id)).toBe(true)
  const db = drizzleOf(fx.payload)
  await db.execute(
    sql`INSERT INTO discussion_replies (topic_id,seq,body,author_id,submission_key) SELECT ${id},g,'Audit earlier reply',${fx.users.editor.id},${`audit-${id}-`}||g FROM generate_series(1,50) g`,
  )
  await db.execute(sql`UPDATE discussion_topics SET last_seq=50 WHERE id=${id}`)
  await page.goto(`${BASE}/discuss/${id}?page=1`)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.route('**/api/discussion-replies', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fetch()
    await route.abort('failed')
  })
  await page.getByLabel('Reply', { exact: true }).fill('Audit uncertain reply')
  await page.getByRole('button', { name: 'Post reply', exact: true }).click()
  await page.waitForURL(new RegExp(`/discuss/${id}\\?page=2#reply-51$`))
  await page.unroute('**/api/discussion-replies')
  await expect(page.locator('#reply-51')).toContainText('Audit uncertain reply')
  const rows = await fx.payload.find({
    collection: 'discussion-replies',
    where: { and: [{ topic: { equals: id } }, { body: { equals: 'Audit uncertain reply' } }] },
    overrideAccess: true,
    depth: 0,
    pagination: false,
  })
  expect(rows.docs).toHaveLength(1)
})

test('audit: route, viewport and accessibility crawl', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(600000)
  const findings: unknown[] = []
  const roles: (RoleKey | null)[] = [null, 'teacher', 'editor', 'subjectAdmin', 'siteAdmin']
  for (const role of roles) {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      if (role) await loginAs(page, fx, role)
      const paths = role
        ? ['/', '/guide', `/lessons/${fx.plan.id}`, '/messages', '/discuss', '/admin']
        : ['/login', '/signup', '/guide', '/explore']
      for (const width of [360, 768, 1280])
        for (const path of paths) {
          await page.setViewportSize({ width, height: 900 })
          const response = await page.goto(`${BASE}${path}`)
          await page.locator('body').waitFor()
          const metrics = await page.evaluate(() => ({
            width: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            title: document.title,
            h1: [...document.querySelectorAll('h1')].map((x) => x.textContent),
          }))
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
          const name = `${browserName}-${role ?? 'anonymous'}-${width}-${path.replace(/[^a-z0-9]/gi, '_')}`
          await page.screenshot({ path: `${artifact}/${name}.png`, fullPage: true })
          findings.push({
            role,
            width,
            path,
            status: response?.status(),
            finalPath: new URL(page.url()).pathname,
            metrics,
            violations: axe.violations,
          })
        }
    } finally {
      await context.close()
    }
  }
  await writeFile(
    `${artifact}/${browserName}-crawl.json`,
    JSON.stringify({ source: '6e75a173e822e4c4be42821b0a4af48ca457bd36', findings }, null, 2),
  )
  await testInfo.attach('crawl-summary', {
    body: JSON.stringify({ pages: findings.length, browser: browserName }),
    contentType: 'application/json',
  })
})
