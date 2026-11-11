/**
 * The Role notes chart on a phone (review of #502): at narrow widths the subject-grade groups hang
 * from one spine as an indented tree, and every box must stay inside its group's panel — at 320px
 * two 9rem teachers side by side used to spill over the spine and scroll the page sideways.
 */
import { expect, test } from '@playwright/test'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture
test.beforeAll(async () => {
  fx = await setupRoleFixture()
})
test.afterAll(async () => {
  await fx?.teardown()
})

for (const width of [320, 360, 390]) {
  test(`Role notes chart at ${width}px: every box stays inside its group's panel`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/guide?at=role-notes`)
    const chart = page.locator('.roles-chart').first()
    await chart.scrollIntoViewIfNeeded()
    await expect(chart).toBeVisible()

    const spill = await page.evaluate(() =>
      [...document.querySelectorAll('.roles-chart__panel')].flatMap((panel) => {
        const p = panel.getBoundingClientRect()
        return [...panel.querySelectorAll('.roles-chart__box')].flatMap((box) => {
          const b = box.getBoundingClientRect()
          return b.left < p.left - 0.5 || b.right > p.right + 0.5
            ? [`${box.textContent?.trim()}: ${b.left}–${b.right} outside ${p.left}–${p.right}`]
            : []
        })
      }),
    )
    expect(spill, 'boxes outside their panel').toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      'horizontal page scroll',
    ).toBeLessThanOrEqual(0)
  })
}
