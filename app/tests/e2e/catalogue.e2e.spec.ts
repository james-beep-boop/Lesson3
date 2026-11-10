/**
 * Catalogue coverage (`/` — the browse page every role shares, `app/(frontend)/page.tsx`), which had
 * NONE before this. Runs exactly like `manage.e2e.spec.ts` — see its header.
 *
 * ⚑ Written BEFORE the `depth: 0` perf rewrite of that page, which is the point: the rewrite turns every
 * populated relationship into a bare id, and a naive version degrades SILENTLY. `subjectName` falls back
 * to 'Unknown subject', `grade` to null, and `canEdit` to site-admin-only. Nothing throws.
 *
 * `canEdit` is the one worth stating: it fails CLOSED, so a broken lookup removes a teacher with editing access's edit
 * affordance while a Teacher's view still looks perfect — which is why the load-bearing assertion is the
 * EDITOR case, and why the Teacher case is not evidence on its own (it passes against broken code).
 *
 * Full rationale and measurements: DECISIONS 2026-08-04 (late).
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { subjectGradeLabel } from '../../src/lib/substrand'

/** The fixture's sub-strand name — `minimalBundleContent()` sets `meta.substrand_name`. */
const ROW_NAME = `${MARK}Sub-strand`
const PINNED_SEMVER = '1.1.0'

let fx: RoleFixture

/** This run's row, located by its MARK-tagged sub-strand name. */
const rowFor = (page: Page) => page.locator('.substrand-row', { hasText: ROW_NAME })

test.describe('Catalogue (/)', () => {
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
  })

  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('row renders with its two-hop subject/grade heading, label and lesson count; Teacher gets no edit affordance', async ({
    page,
  }) => {
    await loginAs(page, fx, 'teacher')

    // The heading carries subject.name (two hops from the version) AND the grade (one hop), so this one
    // assertion covers both. Built with the SAME helper the page uses, rather than a hand-written
    // "<name> · Grade <n>" — that format has one owner (lib/substrand.ts) precisely so a separator
    // change cannot make a test disagree with the product.
    const heading = subjectGradeLabel(fx.subject.name, fx.subjectGrade.grade)
    await expect(page.locator('.sg-head', { hasText: heading })).toBeVisible()

    const row = rowFor(page)
    await expect(row).toHaveCount(1)
    await expect(row.locator('.substrand-name')).toContainText(ROW_NAME)
    // `lessons: { id: true }` yields the count via length — minimalBundleContent() seeds exactly one.
    await expect(row.locator('.substrand-count')).toContainText('1 lesson')
    // A Teacher has no edit grant, so the versions slot is absent. Asserted here rather than in its own
    // test because it needs the same session and the same row — and on its own it proves nothing.
    await expect(row.locator('.substrand-versions')).toHaveCount(0)
  })

  test('canEdit: a teacher with editing access gets the edit affordance on their subject-grade', async ({
    page,
  }) => {
    await loginAs(page, fx, 'editor')
    await expect(rowFor(page)).toHaveCount(1)
    await expect(rowFor(page).locator('.substrand-versions')).toHaveCount(1)
  })

  test('a favourite on a NON-Official version renders as a pinned pseudo-row', async ({ page }) => {
    // A second version on the fixture plan, deliberately NOT the Official pointer, plus the teacher's
    // favourite on it — the only way a pinned pseudo-row exists (§10 / PR ②).
    const pinned = await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: PINNED_SEMVER,
        title: `${MARK}Plan v${PINNED_SEMVER}`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })
    await fx.payload.create({
      collection: 'favorites',
      data: { user: fx.users.teacher.id, version: pinned.id },
      overrideAccess: true,
    })

    await loginAs(page, fx, 'teacher')
    // Favorites have their own view since the 2026-11-10 interface refinement.
    await page.getByRole('button', { name: 'My favorites', exact: true }).click()
    const pinnedRow = page.locator('.substrand-row', {
      hasText: `v${PINNED_SEMVER} (pinned)`,
    })
    await expect(pinnedRow).toHaveCount(1)
    await expect(pinnedRow.locator('.substrand-name')).toContainText(ROW_NAME)
    await expect(pinnedRow.locator('a.substrand-link')).toHaveAttribute(
      'href',
      `/lessons/${fx.plan.id}?version=${pinned.id}`,
    )
  })

  // Runs after the pinned-favorite test, which gave the fixture plan a second version: the version
  // controls now have a real choice, so this is the case where the gate matters.
  test('lesson page: a plain Teacher sees Details only; a teacher with editing access sees Versions & details', async ({
    page,
  }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}`)
    const teacherDetails = page.locator('details.lesson-details')
    await expect(teacherDetails.locator('summary')).toHaveText('Details')
    await teacherDetails.locator('summary').click()
    await expect(teacherDetails.getByText('Saved by')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Compare', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /versions/ })).toHaveCount(0)

    await page.context().clearCookies()
    await loginAs(page, fx, 'editor')
    await page.goto(`${BASE}/lessons/${fx.plan.id}`)
    const editorDetails = page.locator('details.lesson-details')
    await expect(editorDetails.locator('summary')).toHaveText('Versions & details')
    await editorDetails.locator('summary').click()
    await expect(editorDetails.getByRole('link', { name: 'Compare', exact: true })).toBeVisible()
  })

  test('a long subject name never widens the page on a phone, in either view', async ({ page }) => {
    // The fixture subject is `${MARK}Biology` (50+ characters), longer than any real subject such as
    // "Computer Science and Information Technology". The native select sizes to its longest option,
    // so without a width cap the filter row pushed the page sideways even with All subjects chosen.
    expect(fx.subject.name.length).toBeGreaterThan(45)
    await page.setViewportSize({ width: 320, height: 800 })
    await loginAs(page, fx, 'teacher')
    const select = page.locator('.filter-group--subject select')
    await expect(select).toHaveValue('')
    await expect(select.locator('option', { hasText: fx.subject.name })).toHaveCount(1)
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 800 })
      for (const view of ['All lesson plans', 'My favorites']) {
        await page.getByRole('button', { name: view, exact: true }).click()
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `${view} at ${width}px`).toBe(0)
      }
    }
  })

  test('phone portrait: no Request editing access, PDF and Share share one row; landscape keeps it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}`)
    const request = page.getByRole('button', { name: 'Request editing access' })
    const pdf = page.getByRole('button', { name: 'PDF', exact: true })
    const share = page.getByRole('button', { name: /^Share/ })
    await expect(pdf).toBeVisible()
    await expect(share).toBeVisible()
    await expect(request).toBeHidden()
    const [p, s] = [await pdf.boundingBox(), await share.boundingBox()]
    expect(Math.abs(p!.y - s!.y), 'PDF and Share on one row').toBeLessThan(4)

    await page.setViewportSize({ width: 844, height: 390 })
    await expect(request).toBeVisible()
  })
})
