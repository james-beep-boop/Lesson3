/**
 * Custom admin LIST-view coverage (production-readiness item ②) — the Lesson Plans catalogue
 * (`src/components/AdminLessonList`) and the version-list Title cell (`src/components/VersionTitleCell`)
 * are bespoke replacements for Payload's stock table views, wired via `admin.components.views.list`
 * and the `title` column's `Cell` override. They carry ZERO direct coverage, so a regression could
 * silently break the admin repair surface while unit/int/http stay green. This spec drives the REAL
 * rendered admin UI and asserts the four behaviours those views exist to provide:
 *
 *   1. Clean titles — a row shows the structured `meta.substrand_name`, never the shouty stored
 *      `title` ("… GRADE 99: …") that Payload's default table would repeat.
 *   2. Official `v{semver}` badge — a plan with a resolved Official version shows its version pill.
 *   3. "No Official version" marker — a pointerless plan stays visible with a warn badge so an admin
 *      can repair or delete it (the whole reason the custom view replaces the stock one).
 *   4. Site-Admin per-ID delete — selecting a row + Delete removes that plan (and cascades its
 *      versions) and the row disappears.
 *
 * HOW IT RUNS (needs the running app + a seedable DB — Playwright is dev-only, NOT in the Rock
 * container flow; see NEXT-SESSION item ②). Like the HTTP suite it seeds the shared, MARK-tagged,
 * self-cleaning role fixture (`tests/helpers/fixtures.ts`) via the Local API into the SAME DB the app
 * serves, then talks to the app over the browser. Point it at a stack with:
 *   - `E2E_BASE_URL` (default `http://localhost:3000`, the dev server) — the app under test;
 *   - `DATABASE_URI` etc. in the env (dotenv is loaded by playwright.config.ts) — for fixture seeding.
 * Scope note: every seeded record's visible text carries the per-run `MARK`, so assertions locate
 * exactly this run's rows and are unaffected by any real corpus already in the DB.
 */
import { test, expect, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

// Clean, mixed-case structured names the custom views should surface…
const OFFICIAL_SUBSTRAND = `${MARK}Photosynthesis Basics`
// …versus the shouty stored title they must NOT leak (Payload's default cell would show this).
const SHOUTY_TITLE = `${MARK}BIOLOGY GRADE 99: PHOTOSYNTHESIS BASICS`
const POINTERLESS_TITLE = `${MARK}Pointerless Plan`
const DELETABLE_TITLE = `${MARK}Deletable Plan`

test.describe('Admin lesson-plans catalogue', () => {
  let fx: RoleFixture
  let page: Page

  test.beforeAll(async ({ browser }) => {
    // Full role world + a plan with an Official 1.0.0 version (unused here but harmless), plus the
    // three scenario records this spec asserts on — all tagged with the same run MARK, so fx.teardown
    // removes them in one sweep.
    fx = await setupRoleFixture()
    const { payload, subjectGrade } = fx
    const sg = subjectGrade.id

    // (1)+(2) A plan whose Official version has a clean substrand_name AND a deliberately shouty
    // stored title — proves the views render the clean name and never surface the shouty one.
    const content = minimalBundleContent()
    content.meta.substrand_id = '99.2'
    content.meta.substrand_name = OFFICIAL_SUBSTRAND
    const officialPlan = await payload.create({
      collection: 'lesson-plans',
      data: { title: SHOUTY_TITLE, subjectGrade: sg },
      overrideAccess: true,
    })
    const officialVersion = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: officialPlan.id,
        subjectGrade: sg,
        semver: '1.0.0',
        title: SHOUTY_TITLE,
        ...content,
      } as never,
      overrideAccess: true,
    })
    await payload.update({
      collection: 'lesson-plans',
      id: officialPlan.id,
      data: { officialVersion: officialVersion.id },
      overrideAccess: true,
    })

    // (3) A pointerless plan (no Official version) → renders the "No Official version" warn badge.
    await payload.create({
      collection: 'lesson-plans',
      data: { title: POINTERLESS_TITLE, subjectGrade: sg },
      overrideAccess: true,
    })

    // (4) A throwaway plan the delete test consumes — pointerless keeps it cheap; deleting it never
    // touches real corpus.
    await payload.create({
      collection: 'lesson-plans',
      data: { title: DELETABLE_TITLE, subjectGrade: sg },
      overrideAccess: true,
    })

    const context = await browser.newContext()
    page = await context.newPage()
    await login({ page, serverURL: BASE, user: { email: fx.users.siteAdmin.email, password: fx.password } })
  })

  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('renders the clean substrand name and Official version badge, not the shouty title', async () => {
    await page.goto(`${BASE}/admin/collections/lesson-plans`)

    // The row's clean name is visible…
    const name = page.locator('.substrand-name', { hasText: OFFICIAL_SUBSTRAND })
    await expect(name).toBeVisible()

    // …and its Official version pill shows the semver.
    const row = page.locator('.substrand-row', { has: name })
    await expect(row.locator('.lp-admin-list__badge')).toHaveText(/v1\.0\.0/)

    // The shouty stored title (which Payload's default table would repeat) never appears.
    await expect(page.getByText('GRADE 99:', { exact: false })).toHaveCount(0)
  })

  test('flags a pointerless plan with a "No Official version" warn badge', async () => {
    await page.goto(`${BASE}/admin/collections/lesson-plans`)

    const row = page.locator('.substrand-row', {
      has: page.locator('.substrand-name', { hasText: POINTERLESS_TITLE }),
    })
    await expect(row).toBeVisible()
    const warn = row.locator('.lp-admin-list__badge--warn')
    await expect(warn).toHaveText(/No Official version/i)
  })

  test('version-list Title cell de-shouts the stored title', async () => {
    // Load the whole (small) version list on one page so the row is present regardless of corpus size.
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions?limit=100`)

    // The custom cell renders the clean structured name…
    await expect(page.getByText(OFFICIAL_SUBSTRAND, { exact: false }).first()).toBeVisible()
    // …and never the shouty stored title it replaces.
    await expect(page.getByText('GRADE 99:', { exact: false })).toHaveCount(0)
  })

  test('Site Admin can delete a plan from the catalogue', async () => {
    await page.goto(`${BASE}/admin/collections/lesson-plans`)

    // Auto-accept the "Delete N lesson plans?" confirm dialog the delete handler raises.
    page.on('dialog', (dialog) => dialog.accept())

    const checkbox = page.getByLabel(`Select ${DELETABLE_TITLE}`)
    await expect(checkbox).toBeVisible()
    await checkbox.check()

    await page.getByRole('button', { name: /Delete selected/ }).click()

    // After the sequential by-ID delete + router.refresh(), the row is gone.
    await expect(page.getByLabel(`Select ${DELETABLE_TITLE}`)).toHaveCount(0)
  })
})
