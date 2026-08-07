/**
 * Edit recovery in a real browser — matrix cases 13, 26 and 27 (PR 2a's client half).
 *
 * ⚑ **These assert what the TEACHER sees and what the SAVE does. They deliberately do not re-test the
 * protocol branching**, which `tests/unit/useEditRecovery.spec.tsx` pins on fake timers across a
 * dozen interleavings that a browser reproduces slowly and unreliably, if at all. The division is:
 * the unit tests own "given this outcome, what should happen"; this file owns "and the user can
 * actually see it".
 *
 * Each case injects its failure with `page.route`, which is the only honest way to produce a 429 or
 * a dropped connection on demand — waiting for a real rate limit would make the run depend on a
 * shared daily budget, which `AGENTS.md` records as a source of unrelated failures.
 *
 * HOW IT RUNS: same as the other browser specs — a running app plus a seedable DB, fixtures seeded
 * through the Local API into the SAME database the app serves, browsed via `E2E_BASE_URL`.
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs as loginAsRole } from '../helpers/e2e'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})

test.afterAll(async () => {
  await fx?.teardown()
})

/** A candidate version this spec owns, so a failed run cannot disturb the shared fixture's own. */
async function makeVersion(semver: string): Promise<number> {
  const v = (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      title: `${MARK}Recovery ${semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as { id: number }
  return v.id
}

const indicator = (page: Page) => page.locator('.lp-recovery')

/**
 * Open the editor UNLOCKED and wait until a recovery session exists.
 *
 * ⚑ Waits for the indicator rather than for a timeout. `start` is a real round trip, and a fixed
 * sleep here would be the flake every later assertion inherits.
 */
async function openUnlockedEditor(page: Page, versionId: number): Promise<void> {
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${versionId}`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(indicator(page)).toBeVisible()

  // ⚑ Lesson rows render COLLAPSED by default (the 2026-07-25 editor-usability change), so the prose
  // fields are in the DOM but hidden — a click on one waits forever on an element that will never
  // become visible. "Show All" is the editor's own control for this, so the test drives what a
  // teacher would actually press rather than reaching past the UI.
  await page.getByRole('button', { name: 'Show All' }).first().click()
  await expect(page.locator('#field-lessons__0__overview')).toBeVisible()
}

/**
 * Type into the first lesson's overview — a PROSE field.
 *
 * ⚑ Not the document title, which an Editor cannot touch. `title` is admin scope (META), so
 * field-level access keeps it disabled even with the form fully unlocked; an earlier version of this
 * helper typed there and timed out on a disabled input while the page was, correctly, in editing
 * mode. Prose is both what this feature captures and what the role under test may actually edit.
 */
async function typeSomething(page: Page, text: string): Promise<void> {
  const overview = page.locator('#field-lessons__0__overview')
  await overview.click()
  await overview.fill(`${MARK}${text}`)
}

test.describe('case 13 — a rate limit is visible, not silent', () => {
  /**
   * SPEC §5: the timestamp IS the contract. A capture that is being refused must SAY so — silence
   * would leave the teacher believing work is backed up when the server has explicitly refused it.
   */
  test('a 429 shows NOT backed up with the retry delay, and the form stays dirty', async ({
    page,
  }) => {
    await loginAsRole(page, fx, 'editor')
    const versionId = await makeVersion('6.1.0')

    // Refuse only captures; `start` must still succeed or there is no session to report on.
    await page.route('**/api/lesson-bundle-versions/*/recovery', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fulfill({
        status: 429,
        headers: { 'Retry-After': '45', 'Content-Type': 'application/json' },
        body: JSON.stringify({ errors: [{ message: 'Too many requests' }] }),
      })
    })

    await openUnlockedEditor(page, versionId)
    await typeSomething(page, 'rate-limited edit')

    await expect(indicator(page)).toContainText('NOT backed up', { timeout: 20_000 })
    await expect(indicator(page), 'the backoff must be visible, not merely internal').toContainText(
      '45s',
    )
    await expect(indicator(page)).toHaveClass(/lp-recovery--warn/)

    // ⚑ The form stays dirty: a refused backup must never look like a completed one, and Save must
    // remain available so the user can rescue the work themselves.
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})

test.describe('case 26 — a conflicting flush stops the save', () => {
  /**
   * The one case where a failed capture MUST block: a 409 means a precondition on the capture failed,
   * so saving on could retire work this client cannot see.
   */
  test('a 409 on the pre-save flush blocks the save and says so', async ({ page }) => {
    await loginAsRole(page, fx, 'editor')
    const versionId = await makeVersion('6.2.0')

    await openUnlockedEditor(page, versionId)
    await typeSomething(page, 'conflicting edit')

    // Conflict only from here on, so the session starts cleanly and only the pre-save flush fails.
    await page.route('**/api/lesson-bundle-versions/*/recovery', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fulfill({
        status: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errors: [{ message: 'out of date' }] }),
      })
    })

    await page.getByRole('button', { name: 'Save' }).click()

    // ⚑ Scoped to the SAVE message specifically. A bare text match is ambiguous here because the
    // indicator says "out of date" too — which is the neutral wording agreeing across both surfaces,
    // so the ambiguity is a good sign rather than a problem to work around.
    const saveMessage = page.locator('.lesson-controls__msg')
    await expect(saveMessage).toBeVisible({ timeout: 20_000 })
    await expect(saveMessage).toContainText(/out of date/i)
    // Neither surface may name a cause the server did not disclose.
    await expect(saveMessage).not.toContainText(/another tab/i)

    // ⚑ The assertion that matters: it did NOT save. Still on the same document, still editing.
    await expect(page).toHaveURL(new RegExp(`/lesson-bundle-versions/${versionId}`))
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
  })
})

test.describe('case 27 — a transport failure must NOT block the save', () => {
  /**
   * ⚑ The inverse of case 26, and the one that is easy to get backwards. The version save is the
   * operation that matters; the capture is only insurance. Refusing to save because the BACKUP
   * failed would destroy the very work the feature exists to protect — so this proceeds.
   */
  test('a dropped capture still lets the save through', async ({ page }) => {
    await loginAsRole(page, fx, 'editor')
    const versionId = await makeVersion('6.3.0')

    await openUnlockedEditor(page, versionId)
    await typeSomething(page, 'saved despite offline backup')

    // Kill only the capture endpoint; save-as-new is untouched.
    await page.route('**/api/lesson-bundle-versions/*/recovery', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.abort('failed')
    })

    await page.getByRole('button', { name: 'Save' }).click()

    // A successful save navigates to the new candidate version.
    await expect(page).not.toHaveURL(new RegExp(`/lesson-bundle-versions/${versionId}$`), {
      timeout: 30_000,
    })
    await expect(page.getByText(/Viewing:|Editing:/)).toBeVisible()
  })
})
