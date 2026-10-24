/**
 * Native document locks in a real browser — the positive controls for audit F-C22-002.
 *
 * The wire spec (`tests/http/lockedDocuments.http.spec.ts`) proves the API refuses forged and foreign
 * lock writes. What it cannot prove is that the editing form still does everything it did before:
 * Payload creates the lock server-side while a teacher edits, a second editor sees the "Document
 * locked" dialog, and Take over hands the lock to them. Every one of those would break silently if
 * the lock rules were too tight (DECISIONS 2026-10-24 "Native document locks"; the reasons are in
 * `access/lockedDocuments.ts`). The audit's own browser test kept the same peer case as its control.
 *
 * HOW IT RUNS: same as the other browser specs — a running app plus a seedable DB, fixtures seeded
 * through the Local API into the SAME database the app serves, browsed via `E2E_BASE_URL`.
 */
import { test, expect } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { expandLessons, openEditor, typeProse } from '../helpers/editRecoveryUi'
import { MARK, createVersionFixture, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { LOCKED_DOCUMENTS_SLUG } from '../../src/access/lockedDocuments'

let fx: RoleFixture

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})

test.afterAll(async () => {
  await fx?.payload.delete({
    collection: LOCKED_DOCUMENTS_SLUG,
    where: { id: { exists: true } },
    overrideAccess: true,
  })
  await fx?.teardown()
})

/** Who holds the lock on this version right now, read on the trusted path. */
async function holderOf(versionId: number): Promise<number | undefined> {
  const { docs } = await fx.payload.find({
    collection: LOCKED_DOCUMENTS_SLUG,
    where: {
      'document.relationTo': { equals: 'lesson-bundle-versions' },
      'document.value': { equals: versionId },
    },
    depth: 0,
    limit: 1,
    sort: '-updatedAt',
    overrideAccess: true,
  })
  const user = (docs[0] as { user?: { value?: number | { id: number } } } | undefined)?.user?.value
  return typeof user === 'object' ? user.id : user
}

test('a peer sees the "Document locked" dialog and can take over', async ({ browser }) => {
  const version = await createVersionFixture(fx.payload, {
    planId: fx.plan.id,
    subjectGradeId: fx.subjectGrade.id,
    semver: '62.1.0',
  })

  // The first editor (a Teacher with editing access) opens the version and types: the form takes the
  // lock server-side, in their name.
  const first = await browser.newContext()
  const firstPage = await first.newPage()
  await loginAs(firstPage, fx, 'editor')
  await openEditor(firstPage, version.id)
  await expandLessons(firstPage)
  await typeProse(firstPage, `${MARK}first editor is typing`)
  await expect.poll(() => holderOf(version.id), { timeout: 30_000 }).toBe(fx.users.editor.id)

  // A Subject Administrator opens the same version: Payload's warning appears and Take over works.
  const second = await browser.newContext()
  const secondPage = await second.newPage()
  await loginAs(secondPage, fx, 'subjectAdmin')
  await secondPage.goto(`${BASE}/admin/collections/lesson-bundle-versions/${version.id}`)
  const takeOver = secondPage.locator('#document-locked-take-over')
  await expect(takeOver, 'a real peer lock must still raise the dialog').toBeVisible({
    timeout: 30_000,
  })
  await takeOver.click()
  await expect
    .poll(() => holderOf(version.id), { timeout: 30_000, message: 'Take over must move the lock' })
    .toBe(fx.users.subjectAdmin.id)

  await first.close()
  await second.close()
})
