/**
 * Drafts in a real browser (SPEC §5 "Drafts", 2026-10-17).
 *
 * The unit specs own the verdicts (`keepForLater.spec.tsx`, `lessonControlsDrafts.spec.tsx`) and
 * the wire spec owns the count's gate (`recovery.http.spec.ts` S6). This file owns the journey a
 * teacher actually takes, end to end against the real server:
 *
 *   J1  type → Save as draft → the editor closes, says until when, and Edit reads "Continue
 *       editing" → Manage lists it under Your drafts → Continue editing reopens it with the offer
 *   J2  Discard on Manage removes the draft for good
 *   J3  an administrator deleting that version is told someone's draft goes with it
 *   J4  Discard changes in the editor asks, then deletes the draft — nothing is offered back
 *
 * HOW IT RUNS: same as the other browser specs — a running app plus a seedable DB, fixtures seeded
 * through the Local API into the SAME database the app serves, browsed via `E2E_BASE_URL`.
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs as loginAsRole } from '../helpers/e2e'
import { openPanel, panelRegion, panelTrigger } from '../helpers/manageUi'
import {
  formDoc,
  makeRecoveryVersion,
  recoveryHarness,
  retireAllActiveFor,
} from '../helpers/editRecovery'
import {
  awaitCaptured,
  expandLessons,
  openEditor,
  restorePrompt,
  typeProse,
} from '../helpers/editRecoveryUi'
import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { hasUnsavedWork } from '../../src/lib/editRecovery/kernel'

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

/** The editor: type, then Save as draft, and wait for the editor to say the draft is saved. */
async function keepSomething(page: Page, versionId: number, text: string) {
  await openEditor(page, versionId)
  await expandLessons(page)
  await typeProse(page, `${MARK}${text}`)
  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(page.locator('.lesson-controls__notice')).toContainText(
    'Your draft is saved until',
    {
      timeout: 30_000,
    },
  )
}

/** Manage → Lesson plans → Your drafts heading (Proposal B: a panel, closed by default). */
const draftsHeading = (page: Page) => panelTrigger(page, 'Your drafts')

/** Open Your drafts if it is closed, and return its panel region. */
async function openDrafts(page: Page) {
  await openPanel(page, 'Your drafts')
  return panelRegion(page, 'Your drafts')
}

test('J1 a saved draft is listed under Your drafts and Continue editing reopens it', async ({
  page,
}) => {
  await loginAsRole(page, fx, 'editor')
  const versionId = await makeVersion('7.1.0')

  await keepSomething(page, versionId, 'kept for tomorrow')
  // Out of edit mode, and the way back in says a draft exists.
  await expect(page.locator('.lesson-controls__notice strong')).toHaveText('Manage')
  await expect(page.getByRole('button', { name: 'Continue editing' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save as new version' })).toHaveCount(0)

  // A fresh load agrees: the label comes from the server, not only from this page's memory.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Continue editing' })).toBeVisible()

  await page.goto(`${BASE}/admin`)
  // Drafts never open on their own (operator decision 2026-10-22): the closed heading carries the
  // count, while the teacher lands on Your saved versions.
  await expect(draftsHeading(page)).toHaveAccessibleName('Your drafts (1)')
  await expect(draftsHeading(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: /^Your saved versions/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  const section = await openDrafts(page)
  const row = section.locator('li').filter({ hasText: 'Based on version 7.1.0' })
  await expect(row).toContainText('Kept until')

  await row.getByRole('link', { name: 'Continue editing' }).click()
  // `?edit=1` unlocks, `start` resumes the session, and the restore prompt offers the kept work.
  await expect(restorePrompt(page)).toBeVisible({ timeout: 30_000 })
  await expect(restorePrompt(page)).toContainText('kept for tomorrow')
})

test('J2 Discard on Manage removes the draft', async ({ page }) => {
  await loginAsRole(page, fx, 'editor')
  const versionId = await makeVersion('7.2.0')
  await keepSomething(page, versionId, 'about to be discarded')

  await page.goto(`${BASE}/admin`)
  const section = await openDrafts(page)
  const row = section.locator('li').filter({ hasText: 'Based on version 7.2.0' })
  page.once('dialog', (d) => void d.accept())
  await row.getByRole('button', { name: 'Discard' }).click()

  // This was the only kept work: the count goes and the empty state says where drafts come from.
  await expect(section).toContainText('You have no drafts.', { timeout: 15_000 })
  await expect(draftsHeading(page)).toHaveAccessibleName('Your drafts')
})

test('J3 deleting a version warns that someone’s draft goes with it', async ({ page: admin }) => {
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
  expect(d.message()).toContain('1 other person has a draft based on this version')
  await d.dismiss()

  // Declined: the version is still there.
  await expect(admin).toHaveURL(new RegExp(`/lesson-bundle-versions/${versionId}`))
})

test('J4 Discard changes asks, then deletes the draft — nothing is offered back', async ({
  page,
}) => {
  await loginAsRole(page, fx, 'editor')
  const versionId = await makeVersion('7.4.0')

  await openEditor(page, versionId)
  await expandLessons(page)
  await typeProse(page, `${MARK}not wanted after all`)
  await awaitCaptured(page)

  page.once('dialog', (d) => {
    expect(d.message()).toContain('cannot be undone')
    void d.accept()
  })
  await page.getByRole('button', { name: 'Discard changes' }).click()

  // Back in view mode with plain Edit — and after a reload too, where the label is the SERVER's
  // answer: the draft is gone, not merely hidden on this page.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  expect(
    await hasUnsavedWork(
      { payload: fx.payload, transactionID: undefined },
      { userId: fx.users.editor.id, sourceVersionId: versionId },
    ),
    'the draft row is retired',
  ).toBe(false)
})

test('J5 every editing button stays on screen at laptop widths', async ({ page }) => {
  // ⚑ The longer draft labels once ran the button row off the right edge at 1280px — SPEC §5's
  // editing width — hiding Show details and Help (2026-10-17). The row now wraps; this keeps it so.
  await loginAsRole(page, fx, 'editor')
  const versionId = await makeVersion('7.5.0')
  await openEditor(page, versionId)

  for (const width of [1280, 1024, 800]) {
    await page.setViewportSize({ width, height: 800 })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width)
    for (const button of await page.locator('.lesson-controls button').all()) {
      if (!(await button.isVisible())) continue
      const rect = await button.boundingBox()
      expect(
        rect!.x + rect!.width,
        `${await button.innerText()} at ${width}px`,
      ).toBeLessThanOrEqual(width)
    }
  }
})
