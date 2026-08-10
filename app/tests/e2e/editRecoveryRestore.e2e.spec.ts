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
import { makeRecoveryVersion, recoveryRow, setRecoveryProvenance } from '../helpers/editRecovery'
import {
  OVERVIEW,
  awaitCaptured,
  expandLessons,
  indicator,
  openEditor,
  restorePrompt as prompt,
  typeProse,
} from '../helpers/editRecoveryUi'
import { MARK, createUserVerified, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
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
  const v = (await makeRecoveryVersion(fx.payload, {
    planId: fx.plan.id,
    subjectGradeId: fx.subjectGrade.id,
    sourceVersionId: fx.version.id,
    semver,
    titlePrefix: 'Restore ',
  })) as { id: number }
  return v.id
}

/** Type prose and wait until the server confirms it is stored, returning both texts. */
async function captureProse(page: Page, text: string): Promise<{ typed: string; saved: string }> {
  const typed = `${MARK}${text}`
  await expandLessons(page)
  // Read the SAVED value before overwriting it — the restore cases need to tell "still showing what
  // was saved" apart from "silently replaced", and afterwards it is unrecoverable from the page.
  const saved = await page.locator(OVERVIEW).inputValue()
  await typeProse(page, typed)
  await awaitCaptured(page)
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
  // ⚑ `/login` and nothing more. Every caller but case 6 goes straight on to `loginAs`, which loads
  // this same route itself; asserting the form is visible here only duplicated that load.
  await page.goto(`${BASE}/login`)
  await releaseDocumentLocks()
}

/**
 * Drop Payload's own document locks.
 *
 * ⚑ Nothing to do with edit recovery, and that is exactly why it is here. Payload marks a document as
 * being edited and shows the NEXT person to open it a blocking "document locked" dialog; the lock
 * outlives a logout (it expires on a timer). Every case in this file leaves a document and comes back
 * to it, so without this an unrelated feature sits across the path of all of them.
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

test.describe('the offer is a real barrier, not just a panel on top', () => {
  /**
   * ⚑ **The form is NOT locked by `setDisabled`, so the modal is the only barrier — and it was never
   * tested.** Payload 3.85.1's `useField()` derives its `disabled` from `processing || initializing`
   * ONLY (verified in installed source): `useForm().setDisabled` gates SUBMISSION and never touches
   * field editability. So `setDisabled(!editing || recoveryGate)` does not stop anyone typing, here or
   * anywhere else in this editor, and everything that keeps an unread capture safe rests on two things
   * instead — this dialog covering the page, and the hook refusing to capture while an offer is
   * unresolved (`tests/unit/useEditRecovery.spec.tsx`). Both are now asserted rather than assumed.
   *
   * ⚑ The backdrop DOES cover the viewport, including from inside Payload's sticky `.doc-controls` —
   * measured 2026-08-07 at 1280×720 from (0,0), with the bottom of the screen blocked. `position:
   * sticky` does not create a containing block for a fixed descendant; only `transform`, `filter` and
   * `contain` do. This test exists because that is easy to break by accident and nothing would say so.
   */
  test('a click on the form behind the offer does not reach it', async ({ page }) => {
    const versionId = await makeVersion('7.8.0')

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)
    await captureProse(page, 'work behind the barrier')
    await logOut(page)

    await loginAsRole(page, fx, 'editor')
    await openEditor(page, versionId)
    await expect(prompt(page)).toBeVisible()

    // ⚑ Asked of the DOM directly — what is on top at that point? — rather than clicking and looking
    // for a side effect. Payload persists each row's expanded state per user, so "did Show All
    // expand the rows" answers a question about a saved preference, not about the barrier.
    const covered = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Show All',
      )
      if (!btn) return { found: false, blocked: false, topmost: null as string | null }
      const r = btn.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return {
        found: true,
        blocked: Boolean(top?.closest('.modal-backdrop')),
        topmost: top ? top.className || top.tagName : null,
      }
    })

    expect(covered.found, 'the control must be on screen for this to mean anything').toBe(true)
    expect(
      covered.blocked,
      `a control below the toolbar is reachable while the offer is open (topmost: ${covered.topmost})`,
    ).toBe(true)

    // And the panel itself is still interactive — a barrier that covered its own dialog would pass
    // the assertion above for entirely the wrong reason.
    await expect(page.getByRole('button', { name: 'Not now' })).toBeVisible()
    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(prompt(page)).toHaveCount(0)
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
    await expect(page.locator('input[type="email"]')).toBeVisible()
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
    expect(Number(after?.revision)).toBeGreaterThan(Number(before?.revision))

    /**
     * ⚑ The row is RETIRED and then REACTIVATED, and the second half is what this asserts.
     *
     * `retire` sets `retired_at`; `capture` requires `retired_at IS NULL`. Leaving the row retired
     * would mean every capture for the rest of the session 409s — the teacher declines yesterday's
     * work and, without a word, today's stops being backed up. The client therefore restarts, which
     * clears `retired_at` and advances the GENERATION: a new session, which is exactly what declining
     * the old one means.
     */
    expect(
      after?.retired_at,
      'the row must be live again, or nothing more can be captured',
    ).toBeNull()
    expect(
      Number(after?.generation),
      'reactivation begins a new session, so the generation moves',
    ).toBeGreaterThan(Number(before?.generation))

    // ⚑ And the proof that matters: work typed AFTER the discard is still backed up. The row state
    // above is the mechanism; this is the promise.
    await expandLessons(page)
    await expect(page.locator(OVERVIEW)).toBeEditable()
    await page.locator(OVERVIEW).fill(`${MARK}typed after discarding`)
    await expect(indicator(page)).toHaveClass(/lp-recovery--ok/, { timeout: 30_000 })
    await expect
      .poll(async () => (await recoveryRow(fx.payload, versionId, editorId))?.content)
      .not.toBeNull()
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
  for (const [label, semver, provenance, expectedCopy] of [
    [
      'case 9 — stale source',
      '7.5.0',
      { baseUpdatedAt: '2000-01-01T00:00:00.000Z' },
      /has been saved/i,
    ],
    [
      'case 10 — older schema',
      '7.6.0',
      { schemaVersion: 'sv-ancient' },
      /older version of the editor/i,
    ],
  ] as const) {
    test(`${label}: offered to read and discard, with no Restore control at all`, async ({
      page,
    }) => {
      const versionId = await makeVersion(semver)
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

    // ⚑ AND ASKED DIRECTLY. Everything above is true merely because the UI never renders an Edit
    // button for a Teacher, so the endpoint is never called — which would leave this case passing
    // against a server that hands the capture straight back. The gate under test is the endpoint's
    // re-authorization, so the test has to be the thing that calls it, with this user's real session
    // cookie and no UI in the way.
    const direct = await page.evaluate(async (id) => {
      const r = await fetch(`/api/lesson-bundle-versions/${id}/recovery`, {
        credentials: 'same-origin',
      })
      return { status: r.status, body: await r.text() }
    }, versionId)

    expect(direct.status, 'the endpoint must refuse a user who lost editing access').toBe(404)
    expect(direct.body, 'and must not leak the prose in the refusal').not.toContain(typed)

    // The same for `start`: reactivating the row would be a second way back in.
    const restart = await page.evaluate(async (id) => {
      const r = await fetch(`/api/lesson-bundle-versions/${id}/recovery/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: '{}',
      })
      return r.status
    }, versionId)
    expect(restart).toBe(404)
  })
})
