/**
 * "This version is no longer available" (operator decision 2026-10-09,
 * `docs/DESIGN-discussions-2026-10-09.md` §16.1; resolver: `src/lib/requestedVersion.ts`).
 *
 * A link naming a version that does not resolve — deleted, malformed, another plan's — used to show a
 * DIFFERENT revision: the lesson page fell back to Official, the compare page to its default pair. It
 * now says so and renders no content. These specs drive the real pages, because the regression this
 * guards against is silent: a fallback renders a perfectly good-looking lesson.
 *
 * ⚑ THE LOAD-BEARING ASSERTIONS are the NEGATIVE ones — no `.doc-section` and no `.compare-grid` on a
 * notice page. The notice text alone would pass against a page that printed it above the substituted
 * content.
 *
 * Runs exactly like `catalogue.e2e.spec.ts` — see `manage.e2e.spec.ts`'s header.
 */
import { test, expect } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture
/** A version that existed and was then deleted — the realistic way a link goes stale. */
let deletedId: number

test.describe('Missing-version notice', () => {
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
    const doomed = await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.1',
        title: `${MARK}Plan v1.0.1`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })
    deletedId = doomed.id
    await fx.payload.delete({
      collection: 'lesson-bundle-versions',
      id: doomed.id,
      overrideAccess: true,
    })
  })

  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('lesson page: a deleted version is stated, with no substituted content', async ({ page }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${deletedId}`)

    await expect(page.locator('.version-unavailable')).toContainText(
      'This version is no longer available.',
    )
    // Not the Official version underneath: no rendered document, no version meta line.
    await expect(page.locator('.doc-section')).toHaveCount(0)
    await expect(page.locator('.lesson-context')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Open the Official version' })).toHaveAttribute(
      'href',
      `/lessons/${fx.plan.id}`,
    )
  })

  test('lesson page: a malformed version id is stated the same way', async ({ page }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}?version=not-an-id`)
    await expect(page.locator('.version-unavailable')).toBeVisible()
    await expect(page.locator('.doc-section')).toHaveCount(0)
  })

  test('lesson page: no version asked for still opens the Official version', async ({ page }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}`)
    await expect(page.locator('.version-unavailable')).toHaveCount(0)
    await expect(page.locator('.lesson-context')).toContainText('Official')
    await expect(page.locator('.doc-section').first()).toBeVisible()
  })

  test('lesson page: an existing version is shown as asked', async ({ page }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${fx.version.id}`)
    await expect(page.locator('.version-unavailable')).toHaveCount(0)
    await expect(page.locator('.doc-section').first()).toBeVisible()
  })

  test('compare page: a deleted side is stated, with no substitute comparison — even with one version left', async ({
    page,
  }) => {
    // The plan now has ONE readable version (the Official). Before this change the page 404'd here;
    // with an explicit, missing `from` it must say why rather than 404 or pick another pair.
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}/compare?from=${deletedId}&to=${fx.version.id}`)

    await expect(page.locator('.version-unavailable')).toContainText(
      'A version in this comparison is no longer available.',
    )
    await expect(page.locator('.compare-grid')).toHaveCount(0)
    await expect(page.locator('.compare-summary')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back to lesson' })).toHaveAttribute(
      'href',
      `/lessons/${fx.plan.id}`,
    )
  })

  test('compare page: existing versions still compare, explicitly and by default', async ({
    page,
  }) => {
    // Runs after the one-version case above, which is why the second version is created here.
    const kept = await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.1.0',
        title: `${MARK}Plan v1.1.0`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })
    await loginAs(page, fx, 'teacher')

    await page.goto(`${BASE}/lessons/${fx.plan.id}/compare?from=${fx.version.id}&to=${kept.id}`)
    await expect(page.locator('.version-unavailable')).toHaveCount(0)
    await expect(page.locator('.compare-summary')).toBeVisible()
    await expect(page.locator('.compare-grid').first()).toBeVisible()

    // No ids at all: the default pair, not a notice.
    await page.goto(`${BASE}/lessons/${fx.plan.id}/compare`)
    await expect(page.locator('.version-unavailable')).toHaveCount(0)
    await expect(page.locator('.compare-summary')).toBeVisible()
  })
})
