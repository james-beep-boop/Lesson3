// interaction-state styles of the shared nav/menu on both surfaces.
import { test } from '@playwright/test'
import fs from 'node:fs'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  await fx.payload.create({
    collection: 'messages',
    overrideAccess: true,
    data: {
      sender: fx.users.teacher.id,
      recipient: fx.users.siteAdmin.id,
      body: `${MARK}unread`,
      lessonPlan: fx.plan.id,
    },
  })
})
test.afterAll(async () => {
  await fx?.teardown()
})

const PROPS = [
  'width',
  'height',
  'top',
  'right',
  'font-size',
  'line-height',
  'background-color',
  'color',
  'border-radius',
  'opacity',
  'outline-style',
  'outline-width',
  'outline-color',
  'outline-offset',
  'box-shadow',
  'padding-left',
  'min-height',
]
const read = (page: import('@playwright/test').Page, sel: string) =>
  page.evaluate(
    ([s, props]) => {
      const el = document.querySelector(s as string)
      if (!el) return null
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        ...Object.fromEntries((props as string[]).map((p) => [p, cs.getPropertyValue(p)])),
        box: `${r.width.toFixed(1)}x${r.height.toFixed(1)} @${r.left.toFixed(1)},${r.top.toFixed(1)}`,
        vw: innerWidth,
      }
    },
    [sel, PROPS] as const,
  )

test('states', async ({ browser }) => {
  test.setTimeout(300_000)
  const out: Record<string, unknown> = {}
  for (const [vp, size] of [
    ['desktop', { width: 1280, height: 900 }],
    ['phone', { width: 390, height: 844 }],
  ] as const) {
    const page = await browser.newPage({ viewport: size })
    await loginAs(page, fx, 'siteAdmin')
    for (const [surf, url] of [
      ['app', '/'],
      ['admin', '/admin'],
    ] as const) {
      const k = `${vp}/${surf}`
      const o: Record<string, unknown> = {}
      await page.goto(`${BASE}${url}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)
      o.avatarBadge = await read(page, '.user-menu__avatar-badge')
      o.avatar = await read(page, '.user-menu__avatar')
      o.dot = await read(page, '.app-nav__dot')
      // keyboard focus on the avatar
      await page.locator('.user-menu__avatar').focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      o.avatarFocus = await read(page, '.user-menu__avatar:focus-visible')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
      o.dropdown = await read(page, '.user-menu__dropdown')
      o.menuBadge = await read(page, '.user-menu__badge')
      o.messages = await read(page, 'a.user-menu__item')
      o.logout = await read(page, '.user-menu__logout')
      await page.locator('a.user-menu__item').focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      o.messagesFocus = await read(page, 'a.user-menu__item:focus-visible')
      await page.locator('button.user-menu__item').click()
      await page.locator('.user-menu__edit-input').fill('')
      await page.locator('.user-menu__edit-btn[type=submit]').click()
      await page.waitForTimeout(200)
      o.error = await read(page, '.user-menu__edit-error')
      o.input = await read(page, '.user-menu__edit-input')
      o.saveBtn = await read(page, '.user-menu__edit-btn')
      await page.evaluate(() =>
        document
          .querySelectorAll<HTMLButtonElement>('.user-menu__edit-btn')
          .forEach((b) => (b.disabled = true)),
      )
      o.saveDisabled = await read(page, '.user-menu__edit-btn')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      o.closedAfterEscape = (await page.locator('.user-menu__dropdown').count()) === 0
      out[k] = o
    }
    await page.close()
  }
  fs.writeFileSync(process.env.STYLE_OUT!, JSON.stringify(out, null, 1))
})
