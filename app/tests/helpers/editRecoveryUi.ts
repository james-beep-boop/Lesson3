/**
 * Driving the edit-recovery UI from a browser spec.
 *
 * ⚑ Separate from `helpers/editRecovery.ts` for the reason `helpers/e2e.ts` records: this file
 * imports only `@playwright/test`, while that one reaches Payload's Local API. Merging them would
 * drag the whole Payload config into the import graph of every spec that only wanted to click a
 * button.
 *
 * ⚑ These were duplicated across `editRecovery.e2e.spec.ts` and `editRecoveryRestore.e2e.spec.ts`,
 * including the indicator's class name and the collapsed-rows rationale written out twice. A UI
 * change then broke two files in two places — which is exactly the drift the sibling helper file was
 * created to stop.
 */
import { expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE } from './e2e'

/** The first lesson's overview — a PROSE field, which is what this feature captures. */
export const OVERVIEW = '#field-lessons__0__overview'

/** The backup indicator. Its text IS the §5 contract, so specs assert on it rather than on timing. */
export const indicator = (page: Page) => page.locator('.lp-recovery')

/** The restore offer. */
export const restorePrompt = (page: Page) => page.locator('.lp-restore')

/**
 * Open a version's editor and press Edit, waiting until a recovery session exists.
 *
 * ⚑ Waits for the indicator rather than for a timeout. `start` is a real round trip, and a fixed
 * sleep here would be the flake every later assertion inherits.
 *
 * The form may still be showing a restore offer afterwards — resolve it before calling
 * {@link expandLessons}, whose click the dialog will otherwise intercept.
 */
export async function openEditor(page: Page, versionId: number): Promise<void> {
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${versionId}`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(indicator(page)).toBeVisible()
}

/**
 * Expand the lesson rows so the prose fields are reachable.
 *
 * ⚑ Lesson rows render COLLAPSED by default (the 2026-07-25 editor-usability change), so the prose
 * fields are in the DOM but hidden — a click on one waits forever on an element that will never
 * become visible. "Show All" is the editor's own control for this, so specs drive what a teacher
 * would actually press rather than reaching past the UI.
 */
export async function expandLessons(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Show All' }).first().click()
  await expect(page.locator(OVERVIEW)).toBeVisible()
}

/**
 * Type into the first lesson's overview.
 *
 * ⚑ Not the document title, which a teacher with editing access cannot touch — `title` is admin scope (META), so
 * field-level access keeps it disabled even with the form fully unlocked. Prose is both what this
 * feature captures and what the role under test may actually edit.
 */
export async function typeProse(page: Page, value: string): Promise<void> {
  await page.locator(OVERVIEW).click()
  await page.locator(OVERVIEW).fill(value)
}

/**
 * Wait until the indicator CONFIRMS the work is stored.
 *
 * ⚑ Waits on the `--ok` TONE, not on the text "backed up". The idle copy is "Unsaved changes WILL BE
 * backed up", so a `toContainText('backed up')` matches instantly, before anything has been sent —
 * every assertion downstream then runs against an empty capture. The tone is the one signal that is
 * false until the server has confirmed the write.
 */
export async function awaitCaptured(page: Page): Promise<void> {
  await expect(indicator(page)).toHaveClass(/lp-recovery--ok/, { timeout: 30_000 })
  await expect(indicator(page)).toContainText('Unsaved changes backed up')
}
