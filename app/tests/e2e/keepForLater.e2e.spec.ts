/**
 * Keep for later in a real browser (SPEC §5, 2026-10-17).
 *
 * The unit specs own the verdicts (`keepForLater.spec.tsx`, `lessonControlsKeepForLater.spec.tsx`)
 * and the wire spec owns the count's gate (`recovery.http.spec.ts` S6). This file owns the journey a
 * teacher actually takes, end to end against the real server:
 *
 *   J1  type → Keep for later → the editor closes and says until when → Manage lists the work →
 *       Resume reopens it with the restore offer
 *   J2  Discard on Manage removes the work for good
 *   J3  an administrator deleting that version is told someone's unsaved work goes with it
 *
 * HOW IT RUNS: same as the other browser specs — a running app plus a seedable DB, fixtures seeded
 * through the Local API into the SAME database the app serves, browsed via `E2E_BASE_URL`.
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs as loginAsRole } from '../helpers/e2e'
import {
  formDoc,
  makeRecoveryVersion,
  recoveryHarness,
  retireAllActiveFor,
} from '../helpers/editRecovery'
import { expandLessons, openEditor, restorePrompt, typeProse } from '../helpers/editRecoveryUi'
import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})

test.afterAll(async () => {
  await fx?.teardown()
})

const { startFor, captureFor } = recoveryHarness(() => fx)

test.beforeEach(async () => {
  await retireAllActiveFor(fx.payload, fx.users.editor.id)
})

/** A candidate version this spec owns, AUTHORED by the editor so the delete paths apply. */
async function makeVersion(semver: string): Promise<number> {
  const v = (await makeRecoveryVersion(fx.payload, {
    planId: fx.plan.id,
    subjectGradeId: fx.subjectGrade.id,
    sourceVersionId: fx.version.id,
    semver,
    titlePrefix: 'Keep ',
  })) as { id: number }
  return v.id
}

/** The editor: type, then Keep for later, and wait for the editor to say the work is kept. */
async function keepSomething(page: Page, versionId: number, text: string) {
  await openEditor(page, versionId)
  await expandLessons(page)
  await typeProse(page, `${MARK}${text}`)
  await page.getByRole('button', { name: 'Keep for later' }).click()
  await expect(page.locator('.lesson-controls__notice')).toContainText('kept until', {
    timeout: 30_000,
  })
}

const unsavedSection = (page: Page) => page.locator('.lp-manage__unsaved')

test('J1 kept work is listed on Manage and Resume reopens it', async ({ page }) => {
  await loginAsRole(page, fx, 'editor')
  const versionId = await makeVersion('7.1.0')

  await keepSomething(page, versionId, 'kept for tomorrow')
  // Out of edit mode: the lifecycle shows Edit again, and nothing is left dirty on screen.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)

  await page.goto(`${BASE}/admin`)
  const section = unsavedSection(page)
  await expect(section.getByRole('heading', { name: 'Your unsaved work' })).toBeVisible()
  const row = section.locator('li').filter({ hasText: 'Version 7.1.0' })
  await expect(row).toContainText('Kept until')

  await row.getByRole('link', { name: 'Resume' }).click()
  // `?edit=1` unlocks, `start` resumes the session, and the restore prompt offers the kept work.
  await expect(restorePrompt(page)).toBeVisible({ timeout: 30_000 })
  await expect(restorePrompt(page)).toContainText('kept for tomorrow')
})

test('J2 Discard on Manage removes the work', async ({ page }) => {
  await loginAsRole(page, fx, 'editor')
  const versionId = await makeVersion('7.2.0')
  await keepSomething(page, versionId, 'about to be discarded')

  await page.goto(`${BASE}/admin`)
  const row = unsavedSection(page).locator('li').filter({ hasText: 'Version 7.2.0' })
  page.once('dialog', (d) => void d.accept())
  await row.getByRole('button', { name: 'Discard' }).click()

  // The section renders only when non-empty, and this was the only kept work.
  await expect(unsavedSection(page)).toHaveCount(0, { timeout: 15_000 })
})

test('J3 deleting a version warns that someone’s unsaved work goes with it', async ({
  page: admin,
}) => {
  const versionId = await makeVersion('7.3.0')

  // The teacher's unsaved work, seeded through the kernel. ⚑ Not by browsing: a teacher who opened
  // the editor leaves Payload's document lock behind, and the administrator would then meet the
  // "document locked" modal instead of the Delete button — a fixture artefact, not this feature.
  const t0 = await startFor(versionId, { userId: fx.users.editor.id })
  const captured = await captureFor(
    versionId,
    t0.generation,
    t0.revision,
    formDoc(`${MARK}work in progress`),
  )
  expect(captured.ok, 'fixture: the capture must land').toBe(true)

  // The administrator presses Delete and reads the confirmation — then declines.
  await loginAsRole(admin, fx, 'subjectAdmin')
  await admin.goto(`${BASE}/admin/collections/lesson-bundle-versions/${versionId}`)
  const dialog = admin.waitForEvent('dialog')
  await admin.getByRole('button', { name: 'Delete' }).click()
  const d = await dialog
  expect(d.message()).toContain('cannot be undone')
  expect(d.message()).toContain('1 other person has unsaved changes on this version')
  await d.dismiss()

  // Declined: the version is still there.
  await expect(admin).toHaveURL(new RegExp(`/lesson-bundle-versions/${versionId}`))
})
