/**
 * The version editor's Back control stays readable in the admin's dark theme (2026-10-18).
 *
 * Every admin button keeps the fixed light fill `--app-btn-bg` in both themes. Back's ink used to be
 * the theme-following `--theme-elevation-800`, which turns near-white in dark mode, so on a phone set
 * to dark mode Back rendered as a blank light button. Its ink is now the fixed `--app-btn-quiet-ink`.
 * Only the browser can see this: the unit suite never computes styles.
 */
import { test, expect } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})

test.afterAll(async () => {
  await fx?.teardown()
})

test.use({ colorScheme: 'dark' })

/** WCAG relative luminance of a computed `rgb(…)` / `rgba(…)` colour. */
const luminance = (css: string): number => {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

test('Back is readable in the dark theme', async ({ page }) => {
  // A Teacher with editing access: a plain Teacher is sent back to the library from the admin.
  await loginAs(page, fx, 'editor')
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${fx.version.id}`)

  // Guard against a vacuous pass: the admin must actually be in its dark theme.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const back = page.getByRole('link', { name: 'Back to lesson' })
  await expect(back).toBeVisible()
  const { color, background } = await back.evaluate((el) => {
    const style = getComputedStyle(el)
    return { color: style.color, background: style.backgroundColor }
  })
  const [light, dark] = [luminance(color), luminance(background)].sort((a, b) => b - a)
  const contrast = (light + 0.05) / (dark + 0.05)
  expect(contrast, `Back ink ${color} on ${background}`).toBeGreaterThanOrEqual(4.5)
})
