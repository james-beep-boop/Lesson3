// dumps computed colours of every element on representative pages.
import { test, type Page } from '@playwright/test'
import fs from 'node:fs'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { dump } from './kit'

let fx: RoleFixture
test.beforeAll(async () => {
  fx = await setupRoleFixture()
})
test.afterAll(async () => {
  await fx?.teardown()
})

const PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'box-shadow',
  'border-top-left-radius',
  'font-size',
  'text-decoration-color',
  'fill',
  'stroke',
  'width',
  'height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-left',
  'top',
  'right',
  'line-height',
  'font-weight',
  'text-align',
  'vertical-align',
  'display',
  'position',
]
const snap = (page: Page) => dump(page, PROPS)

test('snapshot', async ({ page, browser }) => {
  test.setTimeout(300_000)
  const out: Record<string, string[]> = {}
  const anon = await browser.newPage()
  await anon.goto(`${BASE}/login`)
  await anon.waitForLoadState('networkidle')
  out.login = await snap(anon)
  await loginAs(page, fx, 'siteAdmin')
  const pages: Record<string, string> = {
    home: '/',
    lesson: `/lessons/${fx.plan.id}`,
    guide: '/guide',
    discuss: '/discuss',
    messages: '/messages',
    admin: '/admin',
    editor: `/admin/collections/lesson-bundle-versions/${fx.version.id}`,
    users: '/admin/collections/users',
  }
  for (const [k, u] of Object.entries(pages)) {
    await page.goto(`${BASE}${u}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    out[k] = await snap(page)
    const menu = page.locator('button.user-menu__avatar').first()
    if (k === 'home' || k === 'admin') {
      if (await menu.count()) {
        await menu.click()
        await page.locator('.user-menu__dropdown').waitFor()
        out[k + '-menu'] = await snap(page)
        await page.keyboard.press('Escape')
      }
    }
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await loginAs(phone, fx, 'siteAdmin')
  for (const [k, u] of [
    ['phone-home', '/'],
    ['phone-admin', '/admin'],
  ] as const) {
    await phone.goto(`${BASE}${u}`)
    await phone.waitForLoadState('networkidle')
    await phone.waitForTimeout(800)
    out[k] = await snap(phone)
    const m = phone.locator('button.user-menu__avatar').first()
    if (await m.count()) {
      await m.click()
      await phone.locator('.user-menu__dropdown').waitFor()
      out[k + '-menu'] = await snap(phone)
      await phone.keyboard.press('Escape')
    }
  }
  fs.writeFileSync(process.env.STYLE_OUT!, JSON.stringify({ __props: PROPS, ...out }, null, 1))
})
