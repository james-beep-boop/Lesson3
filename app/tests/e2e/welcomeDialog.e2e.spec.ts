/**
 * The first-login Welcome dialog in a real browser.
 *
 * Every other browser spec signs in with the dialog pre-dismissed (`loginAs` in `helpers/e2e.ts`),
 * because it is a modal over the whole page and those specs test the pages behind it. This one keeps
 * it, so pre-dismissing everywhere else does not leave the dialog untested:
 *
 *   W1  a new account sees it, and "Don't show this again" keeps it away after a reload
 *   W2  closing it WITHOUT the checkbox only closes it — it is back on the next full page load
 *       (current behaviour, pinned so a change to it is deliberate)
 */
import { test, expect, type Page } from '@playwright/test'

import { loginAs } from '../helpers/e2e'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})

test.afterAll(async () => {
  await fx?.teardown()
})

const welcome = (page: Page) => page.getByRole('dialog', { name: /^Welcome, / })

test('W1 a new account sees it, and "Don\'t show this again" keeps it away', async ({ page }) => {
  await loginAs(page, fx, 'teacher', { showWelcome: true })
  await expect(welcome(page)).toBeVisible()

  await welcome(page).getByRole('checkbox', { name: "Don't show this again" }).check()
  await welcome(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(welcome(page)).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(welcome(page)).toHaveCount(0)
})

test('W2 closing without the checkbox brings it back on the next page load', async ({ page }) => {
  await loginAs(page, fx, 'editor', { showWelcome: true })
  await expect(welcome(page)).toBeVisible()

  await welcome(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(welcome(page)).toHaveCount(0)

  await page.reload()
  await expect(welcome(page)).toBeVisible()
})
