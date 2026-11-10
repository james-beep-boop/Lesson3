/**
 * Lesson page sections (interface refinement 2026-11-10, step 5): a jump to a lesson opens it BELOW
 * the sticky toolbar for every role and phone width, and a malformed fragment never breaks the page.
 *
 * The toolbar's height depends on the role (a plain Teacher's actions differ from Edit's) and on the
 * width, so the offset is measured, not fixed; this spec checks the result where readers see it.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture
let versionId: number
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  const base = minimalBundleContent()
  // Eight lessons, so the page is long enough that a jump really scrolls.
  const lessons = Array.from({ length: 8 }, (_, i) => ({
    ...base.lessons[0]!,
    title: `${MARK}Lesson ${i + 1} title`,
  }))
  const version = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      ...base,
      lessons,
      title: fx.version.title,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.0.1',
      author: fx.users.editor.id,
      sourceVersion: fx.version.id,
    } as never,
  })
  versionId = version.id
})
test.afterAll(async () => {
  await fx?.teardown()
})

/** DisclosureLinks has mounted (it sets the measured toolbar height); before that no listener runs. */
const hydrated = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--lesson-toolbar-h')),
    )
    .not.toBe('')

/** How far the opened block's title sits below the sticky toolbar's bottom edge (≥ 0 = clear). */
const clearance = (page: Page, id: string) =>
  page.evaluate((target) => {
    const bar = document.querySelector('.lesson-toolbar')!.getBoundingClientRect()
    const title = document.querySelector(`#${target} > summary`)!.getBoundingClientRect()
    return title.top - bar.bottom
  }, id)

for (const role of ['teacher', 'editor'] as const) {
  for (const width of [320, 360, 390]) {
    test(`${role === 'teacher' ? 'Teacher' : 'Teacher with editing access'} at ${width}px: a jump lands below the toolbar`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 740 })
      await loginAs(page, fx, role)
      await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${versionId}`)
      const target = page.locator('#lesson-7')
      await expect(target).not.toHaveAttribute('open')
      await hydrated(page)

      await page.locator('.doc-nav a[href="#lesson-7"]').click()
      await expect(target).toHaveAttribute('open', '')
      await expect.poll(() => clearance(page, 'lesson-7')).toBeGreaterThanOrEqual(0)
      await expect(target.locator('> summary')).toBeInViewport()

      // An inbound link lands the same way.
      await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${versionId}#lesson-6`)
      await expect(page.locator('#lesson-6')).toHaveAttribute('open', '')
      await expect.poll(() => clearance(page, 'lesson-6')).toBeGreaterThanOrEqual(0)
    })
  }
}

test('Teacher on a phone turned sideways: the wrapped toolbar is cleared, then the portrait one', async ({
  page,
}) => {
  // Landscape shows Request editing access again, so the toolbar wraps to two rows; rotating back
  // to portrait shrinks it. The measured offset must follow both.
  await page.setViewportSize({ width: 390, height: 300 })
  await loginAs(page, fx, 'teacher')
  await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${versionId}`)
  await expect(page.getByRole('button', { name: 'Request editing access' })).toBeVisible()
  await hydrated(page)
  await page.locator('.doc-nav a[href="#lesson-7"]').click()
  await expect(page.locator('#lesson-7')).toHaveAttribute('open', '')
  await expect.poll(() => clearance(page, 'lesson-7')).toBeGreaterThanOrEqual(0)

  await page.setViewportSize({ width: 390, height: 740 })
  await page.locator('.doc-nav a[href="#lesson-3"]').click()
  await expect(page.locator('#lesson-3')).toHaveAttribute('open', '')
  await expect.poll(() => clearance(page, 'lesson-3')).toBeGreaterThanOrEqual(0)
})

test('a malformed fragment is ignored, on load and on a later hash change', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await loginAs(page, fx, 'teacher')
  await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${versionId}#%`)
  await expect(page.locator('.doc-disclosure').first()).toBeVisible()
  await expect(page.locator('.doc-disclosure[open]')).toHaveCount(0)
  await hydrated(page)

  await page.evaluate(() => {
    window.location.hash = '%E0%A4%A'
  })
  await page.evaluate(() => {
    window.location.hash = '#lesson-2'
  })
  await expect(page.locator('#lesson-2')).toHaveAttribute('open', '')
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0)
  expect(errors).toEqual([])
})
