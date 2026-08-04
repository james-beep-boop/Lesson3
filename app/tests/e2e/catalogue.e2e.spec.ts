/**
 * Catalogue coverage (`/` — the browse page every role shares, `app/(frontend)/page.tsx`).
 *
 * ⚑ Written 2026-08-04 BEFORE the depth-0 perf rewrite of that page, and this ordering is the point.
 * The page had NO browser coverage at all despite being the one surface every teacher hits, and the
 * rewrite changes how every displayed string is resolved: `depth: 2` populated `subjectGrade → subject`
 * and the row builder read those objects. At `depth: 0` each becomes a bare id, so a naive change
 * degrades SILENTLY — `subjectName` falls back to 'Unknown subject', `grade` to null (both only affect
 * a heading), and `canEdit` to site-admin-only, which quietly removes an Editor's edit affordance.
 * Nothing throws. These assertions are what turn that into a failure.
 *
 * Pinned here:
 *   1. The two-hop display strings — the subject-grade heading is `<subject.name> · Grade <grade>`,
 *      which only renders correctly if BOTH hops resolve.
 *   2. `canEdit` per role — present for an Editor on their subject-grade, absent for a Teacher. The
 *      `.substrand-versions` slot is always rendered for an editor row (LibraryBrowser D4), so its
 *      presence is the observable signal. This is the role-sensitive one; it fails closed, but closed
 *      and silent is still wrong.
 *   3. The row label and lesson count, which come off the version document itself and so must survive
 *      the depth change unchanged.
 *   4. Pinned pseudo-rows — a favourite on a NON-Official version has no catalogue row of its own and
 *      is resolved by a second find with the same shape; it is easy to forget when reshaping the first.
 *
 * HOW IT RUNS: same as manage.e2e.spec.ts — needs a running app + seedable DB, seeds the shared
 * MARK-tagged self-cleaning role fixture through the Local API, browses via `E2E_BASE_URL`
 * (default `http://localhost:3000`). Every seeded record carries the per-run MARK, so assertions
 * locate exactly this run's rows regardless of the real corpus around them.
 */
import { test, expect, type Browser, type Page } from '@playwright/test'

import { login } from '../helpers/login'
import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'

const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** The fixture's sub-strand name — `minimalBundleContent()` sets `meta.substrand_name`. */
const ROW_NAME = `${MARK}Sub-strand`
/** `${subjectName} · Grade ${grade}` (lib/substrand.ts) — proves BOTH relationship hops resolved. */
const SG_HEADING = `${MARK}Biology · Grade 99`

let fx: RoleFixture

async function loginAs(browser: Browser, key: RoleKey): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login({ page, serverURL: BASE, user: { email: fx.users[key].email, password: fx.password } })
  return page
}

/** This run's row, located by its MARK-tagged sub-strand name. */
const rowFor = (page: Page) => page.locator('.substrand-row', { hasText: ROW_NAME })

test.describe('Catalogue (/)', () => {
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
  })

  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('row renders with its two-hop subject/grade heading, label and lesson count', async ({
    browser,
  }) => {
    const page = await loginAs(browser, 'teacher')
    await page.goto(`${BASE}/`)

    // The heading carries subject.name (two hops from the version) AND the grade (one hop). A broken
    // resolution renders "Unknown subject" and drops the grade, so this one assertion covers both.
    await expect(page.locator('.sg-head', { hasText: SG_HEADING })).toBeVisible()

    const row = rowFor(page)
    await expect(row).toHaveCount(1)
    await expect(row.locator('.substrand-name')).toContainText(ROW_NAME)
    // `lessons: { id: true }` yields the count via length — minimalBundleContent() seeds exactly one.
    await expect(row.locator('.substrand-count')).toContainText('1 lesson')
  })

  test('canEdit: an Editor gets the edit affordance on their subject-grade', async ({ browser }) => {
    const page = await loginAs(browser, 'editor')
    await page.goto(`${BASE}/`)
    await expect(rowFor(page).locator('.substrand-versions')).toHaveCount(1)
  })

  test('canEdit: a Teacher does NOT get the edit affordance', async ({ browser }) => {
    const page = await loginAs(browser, 'teacher')
    await page.goto(`${BASE}/`)
    // The row itself must still be there — otherwise this passes for the wrong reason.
    await expect(rowFor(page)).toHaveCount(1)
    await expect(rowFor(page).locator('.substrand-versions')).toHaveCount(0)
  })

  test('a favourite on a NON-Official version renders as a pinned pseudo-row', async ({
    browser,
  }) => {
    // A second version on the fixture plan, deliberately NOT the Official pointer, plus the teacher's
    // favourite on it — the only way a pinned pseudo-row exists (§10 / PR ②).
    const pinned = await fx.payload.create({
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
    await fx.payload.create({
      collection: 'favorites',
      data: { user: fx.users.teacher.id, version: pinned.id },
      overrideAccess: true,
    })

    const page = await loginAs(browser, 'teacher')
    await page.goto(`${BASE}/`)
    // Suffixed `· v1.1.0 (pinned)` and linking straight to `?version=<id>`.
    const pinnedRow = page.locator('.substrand-row', { hasText: `v${'1.1.0'} (pinned)` })
    await expect(pinnedRow).toHaveCount(1)
    await expect(pinnedRow.locator('.substrand-name')).toContainText(ROW_NAME)
    await expect(pinnedRow.locator('a.substrand-link')).toHaveAttribute(
      'href',
      `/lessons/${fx.plan.id}?version=${pinned.id}`,
    )
  })
})
