/**
 * Edit recovery, RESTORE half — matrix cases 4, 5, 6, 8, 9, 10 and 12 (PR 2b).
 *
 * ⚑ **Case 5 is the reason this file is a browser spec and not a unit test.** "A different user on the
 * same browser sees nothing" is a claim about the whole stack at once — the session cookie, the
 * endpoint's `req.user` scoping, and the deliberate absence of any client-side persistence. A unit
 * test can only assert the piece it stubs, and every individual piece here is already right; what
 * needs proving is that nothing ANYWHERE in the chain remembers the previous teacher. On the shared
 * school machines this deployment targets (SPEC §13) that is the difference between a recovery
 * feature and a data leak, so it is asserted first and asserted end to end.
 *
 * The capture-side cases (13, 26, 27) live in `editRecovery.e2e.spec.ts`; this file assumes capture
 * works and is about what happens when the teacher comes back.
 *
 * NOT COVERED HERE — cases 1, 2 and 3, deliberately. All three turn on a token actually expiring, and
 * `tokenExpiration` is a build-time constant in `collections/Users.ts` (7200s) that a browser spec
 * cannot shorten against a running server; the matrix calls for a disposable stack with a shortened
 * value. The DECISION those cases hinge on — clear the screen only when the work is provably stored —
 * is pinned deterministically in `tests/unit/idleLogoutScreenClear.spec.tsx` instead. Recorded rather
 * than quietly skipped, per the matrix's own rule about unmeetable requirements.
 *
 * HOW IT RUNS: same as the other browser specs — a running app plus a seedable DB, fixtures seeded
 * through the Local API into the SAME database the app serves, browsed via `E2E_BASE_URL`.
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs as loginAsRole } from '../helpers/e2e'
import { recoveryRow, setRecoveryProvenance } from '../helpers/editRecovery'
import {
  MARK,
  createUserVerified,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures'
import { login } from '../helpers/login'

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
      title: `${MARK}Restore ${semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as { id: number }
  return v.id
}

const OVERVIEW = '#field-lessons__0__overview'
const prompt = (page: Page) => page.locator('.lp-restore')
const indicator = (page: Page) => page.locator('.lp-recovery')

/** Open the editor UNLOCKED, past the entry gate. */
async function openEditor(page: Page, versionId: number): Promise<void> {
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${versionId}`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(indicator(page)).toBeVisible()
}

/**
 * Expand the lesson rows so the prose fields are reachable.
 *
 * ⚑ SEPARATE from `openEditor`, and that separation is a finding rather than tidiness. Lesson rows
 * render COLLAPSED by default (the 2026-07-25 editor-usability change) and "Show All" is the editor's
 * own control for that — but while a restore offer is open the prompt is a modal, so this click is
 * intercepted by its backdrop. Which is correct: the form is locked until the offer is resolved, and
 * that is the entry gate working. Callers therefore settle the prompt FIRST and expand afterwards.
 */
async function expandLessons(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Show All' }).first().click()
  await expect(page.locator(OVERVIEW)).toBeVisible()
}

/**
 * Type prose and wait until the indicator CONFIRMS it is stored.
 *
 * ⚑ Waits on the indicator, never a fixed sleep. The debounce is 8 s and the round trip is real; a
 * sleep tuned to pass on this laptop is the flake every assertion downstream inherits. The indicator
 * saying so is also exactly the promise SPEC §5 makes to the user, so waiting on it is waiting on the
 * contract rather than on an implementation detail.
 *
 * ⚑ Waits on the `--ok` TONE, not on the text "backed up". The idle copy is "Unsaved changes WILL BE
 * backed up", so a `toContainText('backed up')` matches instantly, before anything has been sent —
 * every test in this file then ran against an empty capture. The tone is the one signal that is
 * false until the server has confirmed the write.
 */
async function captureProse(page: Page, text: string): Promise<{ typed: string; saved: string }> {
  const typed = `${MARK}${text}`
  await expandLessons(page)
  // Read the SAVED value before overwriting it — the restore cases need to tell "still showing what
  // was saved" apart from "silently replaced", and afterwards it is unrecoverable from the page.
  const saved = await page.locator(OVERVIEW).inputValue()
  await page.locator(OVERVIEW).click()
  await page.locator(OVERVIEW).fill(typed)
  await expect(indicator(page)).toHaveClass(/lp-recovery--ok/, { timeout: 30_000 })
  await expect(indicator(page)).toContainText('Unsaved changes backed up')
  return { typed, saved }
}

/**
 * Sign the current session out, the way the avatar menu does (`UserMenu`): revoke the cookie, then
 * navigate to `/login`. Driven directly rather than through the menu because these cases are about
 * what survives a logout, not about the menu's markup — and the menu lives on the frontend chrome,
 * which the admin editor does not render.
 */
async function logOut(page: Page): Promise<void> {
  await page.evaluate(() =>
    fetch('/api/users/logout', { method: 'POST', credentials: 'include' }).then(() => undefined),
  )
  await page.goto(`${BASE}/login`)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await releaseDocumentLocks()
}

/**
 * Drop Payload's own document locks.
 *
 * ⚑ Nothing to do with edit recovery, and that is exactly why it is here. Payload marks a document as
 * being edited and shows the NEXT person to open it a blocking "document locked" dialog; the lock
 * outlives a logout (it expires on a timer). Every case in this file leaves a document and comes back
 * to it, so without this an unrelated feature sits across the path of all seven.
 *
 * ⚑ Cleared rather than dismissed through its "Take over" button. The dialog appears only once the
 * lock query resolves, so a test that looked for it raced its own render — visible on one run,
 * already-clicked on the next. Removing the condition beats polling for a dialog that may never come.
 */
async function releaseDocumentLocks(): Promise<void> {
  await fx.payload.delete({
    collection: 'payload-locked-documents',
    where: { id: { exists: true } },
    overrideAccess: true,
  })
}

test.describe('case 5 — a different user on the same browser sees NOTHING', () => {
  /**
   * ⚑ THE CASE THE WHOLE FEATURE IS SCOPED AROUND. Every capture is keyed on `req.user.id` and the
   * client persists nothing — no `localStorage`, no `sessionStorage` — precisely so this is true by
   * construction rather than by filtering. This test is what stops a future "cache the capture for
   * offline use" convenience from silently undoing it.
   */
  test("the second user gets no prompt and none of the first user's text", async ({ page }) => {
    const versionId = await makeVersion('7.1.0')

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)
    const { typed: secret } = await captureProse(page, 'private notes from the first teacher')
    await logOut(page)

    // A different real user, same browser, same profile, same version.
    await loginAsRole(page, fx, 'subjectAdmin')
    await openEditor(page, versionId)
    await expandLessons(page)

    await expect(prompt(page), 'no restore offer may cross users').toHaveCount(0)
    // ⚑ Asserted against the whole page, not just the field. The leak worth catching is the one that
    // arrives through some surface nobody thought to check.
    await expect(page.locator('body')).not.toContainText(secret)
  })
})

test.describe('case 4 — the same user is OFFERED their work, never given it back silently', () => {
  test('the prompt shows the captured prose and the form still holds the saved value', async ({
    page,
  }) => {
    const versionId = await makeVersion('7.2.0')

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)
    const { typed, saved } = await captureProse(page, 'work that survives a re-login')
    await logOut(page)

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)

    await expect(prompt(page)).toBeVisible()
    await expect(prompt(page), 'the captured prose must be readable before deciding').toContainText(
      typed,
    )

    // ⚑ Attributed to a LESSON, not listed as a bare field name. The capture map is keyed on row
    // UUIDs, so an unattributed list shows "Overview" once per lesson with nothing to tell them
    // apart — which makes the panel unusable for the one decision it exists to support.
    const firstGroup = prompt(page).locator('.lp-restore__group').first()
    await expect(firstGroup.locator('.lp-restore__heading')).toHaveText('Lesson 1')
    await expect(firstGroup.locator('dt', { hasText: /^Overview$/ })).toBeVisible()
    await expect(firstGroup, "the lesson's own prose sits under its own heading").toContainText(
      typed,
    )

    // ⚑ The CAPTURE time, not the source version's mtime. Read off `dateTime` because the visible
    // text is a locale string; the assertion is that it lands in this test's own run, which the
    // source's mtime (minted by `makeVersion` before any of this) would also satisfy — hence the
    // tighter unit test in `useEditRecovery.spec.tsx` pinning where the value comes from.
    const stamp = await prompt(page).locator('time').getAttribute('datetime')
    expect(Date.now() - Date.parse(String(stamp))).toBeLessThan(5 * 60_000)
    // ⚑ NOT auto-applied. The form still holds what was SAVED — silently overwriting it would be the
    // same class of harm as losing the work, pointing the other way.
    await expect(page.locator(OVERVIEW)).toHaveValue(saved)

    await page.getByRole('button', { name: 'Restore these changes' }).click()
    await expect(prompt(page)).toHaveCount(0)

    // Applied exactly, and the form is DIRTY: restored work is unsaved work, and a clean form would
    // let the teacher navigate away and lose it a second time.
    await expandLessons(page)
    await expect(page.locator(OVERVIEW)).toHaveValue(typed)
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})

test.describe('case 6 — an explicit logout keeps the capture for that user', () => {
  /**
   * Distinct from case 4 only in intent, and that is the point: a teacher who signs out deliberately
   * has not asked to throw their unsaved work away. Only an explicit discard (case 8) does that.
   */
  test('signing out and back in still offers the work', async ({ page }) => {
    const versionId = await makeVersion('7.3.0')

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)
    const { typed } = await captureProse(page, 'still here after signing out')
    await logOut(page)

    // The screen is cleared by the logout itself — there is no editor left to inspect.
    await expect(page.locator(OVERVIEW)).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(typed)

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)
    await expect(prompt(page)).toContainText(typed)
  })
})

test.describe('case 8 — an explicit discard retires the capture', () => {
  /**
   * The SAME transition a successful save-as-new performs (case 7): content cleared, the row kept as a
   * marker, `revision` advanced. Asserted against the row rather than the UI because "the prompt went
   * away" is equally true of a discard that silently did nothing.
   */
  test('discarding clears the content and advances the revision', async ({ page }) => {
    const versionId = await makeVersion('7.4.0')
    const editorId = fx.users.editor.id as number

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)
    await captureProse(page, 'work about to be thrown away')
    await logOut(page)

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)
    await expect(prompt(page)).toBeVisible()

    const before = await recoveryRow(fx.payload, versionId, editorId)
    await page.getByRole('button', { name: 'Discard them' }).click()
    await expect(prompt(page)).toHaveCount(0)

    await expect
      .poll(async () => (await recoveryRow(fx.payload, versionId, editorId))?.content)
      .toBeNull()
    const after = await recoveryRow(fx.payload, versionId, editorId)
    expect(after?.retired_at, 'discard retires the row').not.toBeNull()
    expect(Number(after?.revision)).toBeGreaterThan(Number(before?.revision))

    // The form is usable immediately — the discard is not a gate on getting back to work.
    await expandLessons(page)
    await expect(page.locator(OVERVIEW)).toBeEditable()
  })
})

test.describe('cases 9 and 10 — a capture that cannot be trusted is READ-ONLY', () => {
  /**
   * ⚑ Both mismatches mean the same thing and get the same treatment: the capture may be READ, and it
   * may be DISCARDED, but it may never be APPLIED. The capture map is keyed on row ids; if the source
   * moved (`baseUpdatedAt`) or the field shape changed (`schemaVersion`), those keys may no longer
   * mean what they meant, and applying them could land one lesson's prose on another lesson. Showing
   * the text is what keeps this a recovery rather than a deletion — the teacher can still copy it out.
   */
  for (const [label, provenance, expectedCopy] of [
    ['case 9 — stale source', { baseUpdatedAt: '2000-01-01T00:00:00.000Z' }, /has been saved/i],
    ['case 10 — older schema', { schemaVersion: 'sv-ancient' }, /older version of the editor/i],
  ] as const) {
    test(`${label}: offered to read and discard, with no Restore control at all`, async ({
      page,
    }) => {
      const versionId = await makeVersion(label.startsWith('case 9') ? '7.5.0' : '7.6.0')
      const editorId = fx.users.editor.id as number

      await loginAsRole(page, fx, 'editor')
      await openEditor(page, versionId)
      const { typed, saved } = await captureProse(page, 'prose whose provenance no longer matches')
      await logOut(page)

      await setRecoveryProvenance(fx.payload, versionId, editorId, provenance)

      await loginAsRole(page, fx, 'editor')
      await openEditor(page, versionId)

      await expect(prompt(page)).toBeVisible()
      await expect(prompt(page), 'the reason must be stated, not implied').toContainText(
        expectedCopy,
      )
      await expect(prompt(page), 'it must still be readable and copyable').toContainText(typed)

      // ⚑ ABSENT, not disabled. A disabled Restore button sends the user hunting for the condition
      // that would enable it, and there is none they can reach.
      await expect(page.getByRole('button', { name: 'Restore these changes' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Discard them' })).toBeVisible()

      // Continuing leaves the form on the SAVED content — nothing untrusted reaches it.
      await page.getByRole('button', { name: 'Continue editing' }).click()
      await expect(prompt(page)).toHaveCount(0)
      await expandLessons(page)
      await expect(page.locator(OVERVIEW)).toHaveValue(saved)
    })
  }
})

test.describe('case 12 — editing access lost between capture and restore', () => {
  /**
   * ⚑ The capture endpoint re-authorizes on every call rather than trusting the session that created
   * the row, so revoking editing access must close the door on work already captured. A stored
   * capture is prose from a subject-grade this user may no longer read; handing it back because they
   * once could would be a leak with a plausible-sounding excuse attached.
   *
   * Uses a user of its own — revoking the shared fixture's editor would leave every later test in
   * this file editing as a Teacher, and the failure would look like an unrelated UI regression.
   */
  test('the revoked user is offered nothing', async ({ page }) => {
    const versionId = await makeVersion('7.7.0')
    const revoked = await createUserVerified(fx.payload, {
      email: `${MARK.toLowerCase()}revoked@example.com`,
      name: `${MARK}Revoked`,
      password: fx.password,
      assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }],
    } as never)

    await login({ page, serverURL: BASE, user: { email: revoked.email, password: fx.password } })
    await openEditor(page, versionId)
    const { typed } = await captureProse(page, 'captured while still an editor')
    await logOut(page)

    // Access revoked — now a Teacher, who may view and export but not edit.
    await fx.payload.update({
      collection: 'users',
      id: revoked.id,
      data: { assignments: [] } as never,
      overrideAccess: true,
    })

    await login({ page, serverURL: BASE, user: { email: revoked.email, password: fx.password } })
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${versionId}`)

    await expect(prompt(page), 'a revoked user is offered nothing').toHaveCount(0)
    await expect(page.locator('body'), 'and is shown none of it').not.toContainText(typed)
    // No session either: the indicator only appears once a capture session has started.
    await expect(indicator(page)).toHaveCount(0)
  })
})
