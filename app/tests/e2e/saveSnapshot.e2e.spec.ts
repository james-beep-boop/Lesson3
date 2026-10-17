import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers/e2e'
import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { makeRecoveryVersion, recoveryRow } from '../helpers/editRecovery'
import {
  OVERVIEW,
  indicator,
  awaitCaptured,
  expandLessons,
  openEditor,
  typeProse,
} from '../helpers/editRecoveryUi'

let fx: RoleFixture
test.beforeAll(async () => {
  fx = await setupRoleFixture()
})
test.afterAll(async () => {
  await fx?.teardown()
})

function barrier() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('saving after a failed draft lookup preserves the unseen draft and its source', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const version = await makeRecoveryVersion(fx.payload, {
    planId: fx.plan.id,
    subjectGradeId: fx.subjectGrade.id,
    sourceVersionId: fx.version.id,
    semver: '9.3.0',
  })
  page.on('dialog', (dialog) => void dialog.accept())
  await loginAs(page, fx, 'subjectAdmin')
  await openEditor(page, version.id)
  await expandLessons(page)
  await typeProse(page, `${MARK}earlier unseen draft`)
  await awaitCaptured(page)
  const before = await recoveryRow(fx.payload, version.id, fx.users.subjectAdmin.id)
  expect(before?.content).toBeTruthy()

  await page.route(`**/api/lesson-bundle-versions/${version.id}/recovery`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 503, json: { errors: [{ message: 'Injected lookup failure' }] } })
      : route.continue(),
  )
  await openEditor(page, version.id)
  await expect(indicator(page)).toContainText('Could not check for an earlier draft')
  await expandLessons(page)
  await typeProse(page, `${MARK}different edits to save`)
  await page.screenshot({ path: testInfo.outputPath('unchecked-draft.png') })
  const saving = page.waitForRequest((request) => request.url().includes('/save-as-new'))
  await page.getByRole('button', { name: 'Save as new version', exact: true }).click()
  expect((await saving).url()).not.toContain('deleteSource')
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
    .not.toBe(`/admin/collections/lesson-bundle-versions/${version.id}`)
  const savedId = Number(new URL(page.url()).pathname.split('/').at(-1))
  const saved = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: savedId,
    overrideAccess: true,
  })
  expect(saved.lessons?.[0].overview).toBe(`${MARK}different edits to save`)
  expect(
    await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: version.id,
      overrideAccess: true,
    }),
  ).toBeTruthy()
  expect(await recoveryRow(fx.payload, version.id, fx.users.subjectAdmin.id)).toEqual(before)
})

for (const role of ['editor', 'subjectAdmin'] as const) {
  for (const failSave of [false, true]) {
    const roleLabel = role === 'editor' ? 'Teacher with editing access' : 'Subject administrator'
    test(`${roleLabel}: locks both save waits and ${failSave ? 'preserves work on failure' : 'persists the snapshot'}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: role === 'editor' ? 1280 : 900, height: 900 })
      const version = await makeRecoveryVersion(fx.payload, {
        planId: fx.plan.id,
        subjectGradeId: fx.subjectGrade.id,
        sourceVersionId: fx.version.id,
        semver: `9.${role === 'editor' ? 1 : 2}.${failSave ? 100 : 0}`,
      })
      await loginAs(page, fx, role)
      await openEditor(page, version.id)
      await expandLessons(page)
      await typeProse(page, `${MARK}initial backup`)
      await awaitCaptured(page)

      const capture = barrier()
      const save = barrier()
      let captureSeen = false
      let saveSeen = false
      let deleteSource = false
      await page.route(`**/api/lesson-bundle-versions/${version.id}/recovery`, async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        captureSeen = true
        await capture.promise
        await route.continue()
      })
      await page.route(
        `**/api/lesson-bundle-versions/${version.id}/save-as-new*`,
        async (route) => {
          saveSeen = true
          deleteSource = route.request().url().includes('deleteSource=true')
          await save.promise
          if (failSave)
            return route.fulfill({
              status: 503,
              json: { errors: [{ message: 'Injected save failure' }] },
            })
          await route.continue()
        },
      )
      page.on('dialog', (dialog) => void dialog.accept())
      const text = `${MARK}snapshot saved after delayed requests`
      await typeProse(page, text)
      await page.getByRole('button', { name: 'Save as new version', exact: true }).click()
      try {
        await expect.poll(() => captureSeen).toBe(true)
        await expect(page.locator(OVERVIEW)).toBeDisabled()
        await page.keyboard.type('MUST NOT APPEAR')
        await expect(page.locator(OVERVIEW)).toHaveValue(text)
        capture.release()
        await expect.poll(() => saveSeen).toBe(true)
        await expect(page.locator(OVERVIEW)).toBeDisabled()
        await page.keyboard.type('ALSO MUST NOT APPEAR')
        await expect(page.locator(OVERVIEW)).toHaveValue(text)
        if (role === 'subjectAdmin') {
          const addRow = page.locator('.array-field__add-row').first()
          await expect(addRow).toHaveCount(1)
          await expect(addRow).toBeDisabled()
          expect(deleteSource).toBe(true)
        }
        await page.screenshot({ path: testInfo.outputPath('saving.png') })
        save.release()
        if (failSave) {
          await expect(
            page.getByRole('alert').filter({ hasText: 'Injected save failure' }),
          ).toBeVisible()
          await expect(page.locator(OVERVIEW)).toBeEditable()
          await expect(page.locator(OVERVIEW)).toHaveValue(text)
          await expect(
            page.getByRole('button', { name: 'Save as new version', exact: true }),
          ).toBeEnabled()
        } else {
          // Save and its navigation are asynchronous. The default five-second assertion expired
          // even though the failure snapshot already showed the saved version; use the normal
          // navigation budget within this test's explicit 120-second limit.
          await expect
            .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
            .not.toBe(`/admin/collections/lesson-bundle-versions/${version.id}`)
          const savedId = Number(new URL(page.url()).pathname.split('/').at(-1))
          expect(savedId).not.toBe(version.id)
          const saved = await fx.payload.findByID({
            collection: 'lesson-bundle-versions',
            id: savedId,
            depth: 0,
            overrideAccess: true,
          })
          expect(saved.lessonPlan).toBe(fx.plan.id)
          expect(saved.lessons?.[0].overview).toBe(text)
          if (deleteSource) {
            expect(
              (
                await fx.payload.count({
                  collection: 'lesson-bundle-versions',
                  where: { id: { equals: version.id } },
                  overrideAccess: true,
                })
              ).totalDocs,
            ).toBe(0)
          }
          await page.getByRole('button', { name: /^(Edit|Continue editing)$/ }).click()
          await expandLessons(page)
          await expect(page.locator(OVERVIEW)).toBeEditable()
          await expect(page.locator(OVERVIEW)).toHaveValue(text)
        }
      } finally {
        capture.release()
        save.release()
      }
    })
  }
}
