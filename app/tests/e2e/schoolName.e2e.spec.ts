import { test, expect } from '@playwright/test'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { setSchoolName } from '../../src/lib/setSchoolName'

let fx: RoleFixture
let original: string
const NAME = 'Kisumu Boys High School'
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  original =
    (await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).schoolName ??
    ''
  // Ensure Discussions is available for this display test, independently of prior suites.
  await fx.payload.updateGlobal({
    slug: 'system-settings',
    data: { features: { forumEnabled: true } },
    overrideAccess: true,
  })
})
test.afterAll(async () => {
  if (fx) await setSchoolName(fx.payload, original)
  await fx?.teardown()
})

test('an unset name leaves the existing sign-in, tab, menu and headings unchanged', async ({
  page,
}) => {
  await setSchoolName(fx.payload, '')
  await page.goto(`${BASE}/login`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ARES Lesson Plans')
  await expect(page).toHaveTitle('Sign in — ARES Lesson Plans')
  await expect(page.locator('.school-name')).toHaveCount(0)
  await loginAs(page, fx, 'siteAdmin')
  for (const route of ['/', '/discuss', '/admin']) {
    await page.goto(`${BASE}${route}`)
    await expect(page.locator('.school-name')).toHaveCount(0)
    await page.getByRole('button', { name: /^Account menu/ }).click()
    await expect(page.locator('.user-menu__dropdown .school-name')).toHaveCount(0)
  }
})

test('the password-confirmed Save sets the label and Cancel leaves it unchanged', async ({
  page,
}) => {
  await setSchoolName(fx.payload, '')
  await loginAs(page, fx, 'siteAdmin')
  await page.goto(`${BASE}/admin?open=system,system.features`)
  await page.getByRole('textbox', { name: 'School name', exact: true }).fill(`  ${NAME}  `)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Save settings' })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(
    (await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).schoolName,
  ).toBe('')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Save settings' })
  await dialog.getByLabel('Your password').fill(fx.password)
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/system-settings/save') && r.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Save settings', exact: true }).click()
  expect((await response).status()).toBe(200)
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.lp-admin-dash > .school-name')).toHaveText(NAME)
})

for (const width of [1280, 375]) {
  test(`school name appears in all five locations at ${width}px without changing the top bar`, async ({
    page,
  }, testInfo) => {
    await setSchoolName(fx.payload, NAME)
    await page.setViewportSize({ width, height: 850 })
    await page.goto(`${BASE}/login`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAME)
    await expect(page.locator('.login-title')).toHaveText('ARES Lesson Plans')
    await expect(page).toHaveTitle(`${NAME} — ARES Lesson Plans`)
    await loginAs(page, fx, 'siteAdmin')
    for (const [route, heading] of [
      ['/', 'Lesson Plans'],
      ['/discuss', 'Discussions'],
      ['/admin', 'Manage'],
    ]) {
      await page.goto(`${BASE}${route}`)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await expect(page.locator('.school-name')).toHaveText(NAME)
      const header = page.getByRole('banner')
      await expect(header.getByRole('link', { name: 'ARES Lesson Plans', exact: true })).toHaveText(
        'ARES Lesson Plans',
      )
      await expect(header).not.toContainText(NAME)
      expect(await header.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.getByRole('button', { name: /^Account menu/ }).click()
      await expect(page.locator('.user-menu__dropdown > .school-name').first()).toHaveText(NAME)
      expect(
        await page
          .locator('.user-menu__dropdown')
          .evaluate((el) => el.getBoundingClientRect().right),
      ).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: testInfo.outputPath(`school-name-${heading}-${width}.png`),
        fullPage: true,
      })
      await page.getByRole('button', { name: /^Account menu/ }).click()
    }
    await page.goto(`${BASE}/admin?open=system,system.features`)
    const input = page.getByRole('textbox', { name: 'School name', exact: true })
    await expect(input).toHaveValue(NAME)
    expect(await input.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(
      width,
    )
    if (width === 375)
      expect(
        await input.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44)
  })
}
