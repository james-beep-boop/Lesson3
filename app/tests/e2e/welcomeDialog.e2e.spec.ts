/**
 * The first-login Welcome dialog in a real browser.
 *
 * Every other browser spec signs in with the dialog pre-dismissed (`loginAs` in `helpers/e2e.ts`),
 * because it is a modal over the whole page and those specs test the pages behind it. This one keeps
 * it, so pre-dismissing everywhere else does not leave the dialog untested:
 *
 *   W1  a new account sees it once: after closing it, it does not come back
 *   W2  it is not shown again even if it was never closed (it counts as seen when it appears)
 *   W3  following one of its links closes it, and it stays closed on the next page
 *
 * ⚑ It used to come back on every page load unless "Don't show this again" was ticked — reported as
 * popping up relentlessly (operator, 2026-10-20). Once means once.
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})

test.afterAll(async () => {
  await fx?.teardown()
})

const welcome = (page: Page) => page.getByRole('dialog', { name: /^Welcome, / })

test('W1 a new account sees it once, and closing it keeps it away', async ({ page }) => {
  await loginAs(page, fx, 'teacher', { showWelcome: true })
  await expect(welcome(page)).toBeVisible()
  await expect(welcome(page).getByRole('checkbox')).toHaveCount(0)

  await welcome(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(welcome(page)).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(welcome(page)).toHaveCount(0)
  await page.goto(`${BASE}/guide`)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(welcome(page)).toHaveCount(0)
})

test('W2 it is not shown again even when it was never closed', async ({ page }) => {
  await loginAs(page, fx, 'editor', { showWelcome: true })
  await expect(welcome(page)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(welcome(page)).toHaveCount(0)
})

test('W3 following one of its links closes it, and it stays closed', async ({ page }) => {
  // Each test has a fresh browser, so this account's first visit is new again here.
  await loginAs(page, fx, 'teacher', { showWelcome: true })
  await welcome(page).getByRole('link', { name: 'Send a message →' }).click()
  await expect(page).toHaveURL(/\/messages/)
  await expect(welcome(page)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(welcome(page)).toHaveCount(0)
})
