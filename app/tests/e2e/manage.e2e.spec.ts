/**
 * Manage-page coverage (IA redesign PR ③ / Codex 2026-07-01 #7) — the role-scoped functions page
 * (`src/components/AdminDashboard`) replaced both the admin lesson-plans catalogue and the versions
 * list, so it is now the custom admin surface with the highest regression risk and no other UI
 * coverage. This spec drives the REAL rendered page and asserts what each role sees and the two
 * interactive flows:
 *
 *   1. Role scoping — Editor: ONLY "My saved versions"; Subject Admin: "Candidate versions" +
 *      "Editors"; Site Admin: + Upload / Delete lesson plans / Curriculum & people.
 *   2. Redirects — the retired list routes (`/admin/collections/lesson-plans`,
 *      `…/lesson-bundle-versions`) land on Manage, and the "Lesson plans" nav group is hidden.
 *   3. Repair — a pointerless plan appears in the Site-Admin Repair section (clean name, links to
 *      the plan form).
 *   4. Delete lesson plans — search → select → delete removes the plan.
 *
 * HOW IT RUNS (like the http suite: needs a running app + a seedable DB; Playwright is dev-only, not
 * in the Rock container gate). Seeds the shared MARK-tagged self-cleaning role fixture via the Local
 * API into the SAME DB the app serves; browse via `E2E_BASE_URL` (default `http://localhost:3000`).
 * Every seeded record's visible text carries the per-run MARK, so assertions locate exactly this
 * run's rows regardless of real corpus.
 */
import { test, expect, type Browser, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import { MARK, setupRoleFixture, type RoleFixture, type RoleKey } from '../helpers/fixtures'

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const POINTERLESS_TITLE = `${MARK}Pointerless Plan`
const DELETABLE_TITLE = `${MARK}Deletable Plan`

let fx: RoleFixture

async function loginAs(browser: Browser, key: RoleKey): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login({ page, serverURL: BASE, user: { email: fx.users[key].email, password: fx.password } })
  return page
}

test.describe('Manage page', () => {
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
    const sg = fx.subjectGrade.id
    // A pointerless plan (Repair section) and a throwaway the delete test consumes.
    await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: POINTERLESS_TITLE, subjectGrade: sg },
      overrideAccess: true,
    })
    await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: DELETABLE_TITLE, subjectGrade: sg },
      overrideAccess: true,
    })
  })

  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('Editor sees ONLY "My saved versions"', async ({ browser }) => {
    const page = await loginAs(browser, 'editor')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'My saved versions' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Editors' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Delete lesson plans' })).toHaveCount(0)
    // The "Lesson plans" nav group is hidden.
    await expect(page.locator("[id='nav-group-Lesson plans']")).toHaveCount(0)
  })

  test('Subject Admin sees candidates + Editors, no Site-Admin panels', async ({ browser }) => {
    const page = await loginAs(browser, 'subjectAdmin')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'Candidate versions' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Editors' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Delete lesson plans' })).toHaveCount(0)
  })

  test('retired list routes redirect to Manage', async ({ browser }) => {
    const page = await loginAs(browser, 'siteAdmin')
    await page.goto(`${BASE}/admin/collections/lesson-plans`)
    await expect(page).toHaveURL(`${BASE}/admin`)
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions`)
    await expect(page).toHaveURL(`${BASE}/admin`)
  })

  test('Site Admin: Repair lists the pointerless plan; full panel set present', async ({ browser }) => {
    const page = await loginAs(browser, 'siteAdmin')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Delete lesson plans' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Repair' })).toBeVisible()
    await expect(
      page.locator('.lp-manage__list a', { hasText: POINTERLESS_TITLE }),
    ).toBeVisible()
  })

  test('Site Admin can delete a plan from the Delete panel', async ({ browser }) => {
    const page = await loginAs(browser, 'siteAdmin')
    await page.goto(`${BASE}/admin`)
    page.on('dialog', (dialog) => dialog.accept())

    await page.getByLabel('Search lesson plans to delete').fill(DELETABLE_TITLE)
    const checkbox = page.getByLabel(`Select ${DELETABLE_TITLE}`)
    await expect(checkbox).toBeVisible()
    await checkbox.check()
    await page.getByRole('button', { name: /Delete selected/ }).click()

    // After the sequential by-ID delete + router.refresh(), the row is gone.
    await expect(page.getByLabel(`Select ${DELETABLE_TITLE}`)).toHaveCount(0)
  })
})
