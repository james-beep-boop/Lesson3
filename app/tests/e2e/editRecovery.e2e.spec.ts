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

import { loginAs as loginAsRole } from '../helpers/e2e'
import { makeRecoveryVersion } from '../helpers/editRecovery'
import { expandLessons, indicator, openEditor, typeProse } from '../helpers/editRecoveryUi'
import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})

test.afterAll(async () => {
  await fx?.teardown()
})

/** A candidate version this spec owns, so a failed run cannot disturb the shared fixture's own. */
async function makeVersion(semver: string): Promise<number> {
  const v = (await makeRecoveryVersion(fx.payload, {
    planId: fx.plan.id,
    subjectGradeId: fx.subjectGrade.id,
    sourceVersionId: fx.version.id,
    semver,
    titlePrefix: 'Recovery ',
  })) as { id: number }
  return v.id
}

/** Open the editor and expand the lesson rows. No offer is possible here — these are fresh rows. */
async function openUnlockedEditor(page: Page, versionId: number): Promise<void> {
  await openEditor(page, versionId)
  await expandLessons(page)
}

const typeSomething = (page: Page, text: string) => typeProse(page, `${MARK}${text}`)

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
