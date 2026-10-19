import { test, expect, type Page } from '@playwright/test'
import { setupRoleFixture, minimalBundleContent, MARK, type RoleFixture } from '../helpers/fixtures'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { openEditor, expandLessons, typeProse, restorePrompt } from '../helpers/editRecoveryUi'
let fx: RoleFixture
let sequence = 0
test.beforeEach(async () => {
  fx = await setupRoleFixture()
})
test.afterEach(async () => {
  await fx?.teardown()
})
async function version(
  sourceVersion = fx.version.id,
  semver = `60.${++sequence}.0`,
  release = false,
) {
  const content = minimalBundleContent()
  content.lessons[0].overview = `Saved text ${semver}`
  if (release) {
    ;(content.lessons[0].resourceLinks as Record<string, unknown>[])[0].fallback_search_url =
      'http://ares.local/modules/new-release'
  }
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      ...content,
      title: fx.version.title,
      semver,
      sourceVersion,
      ...(release ? {} : { author: fx.users.editor.id }),
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
    } as never,
  })
}
async function prepare(page: Page, semver?: string) {
  const source = await version(fx.version.id, semver)
  await loginAs(page, fx, 'editor')
  await openEditor(page, source.id)
  await expandLessons(page)
  await typeProse(page, `${MARK}Private restored wording`)
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible()
  return source
}
const save = (page: Page) => page.getByRole('button', { name: 'Save as new version', exact: true })
async function restoreAndSave(page: Page, sourceId: number) {
  await openEditor(page, sourceId)
  await restorePrompt(page).getByRole('button', { name: 'Restore my draft', exact: true }).click()
  await save(page).click()
  await expect(page).toHaveURL(/draftCombineWith=/)
  return Number(new URL(page.url()).pathname.split('/').pop())
}
async function official() {
  return (await fx.payload.findByID({ collection: 'lesson-plans', id: fx.plan.id, depth: 0 }))
    .officialVersion
}

test('offers ARES 2.0.0 for a draft on teacher 1.0.1, then saves before explicitly combining', async ({
  page,
}) => {
  const source = await prepare(page, '1.0.1')
  const target = await version(fx.version.id, '2.0.0', true)
  await version(fx.version.id, '2.0.9') // Prefer the new ingested release to newer teacher work.
  await openEditor(page, source.id)
  await expect(restorePrompt(page)).toContainText(
    `Version ${target.semver} shares version history with version ${source.semver}. To bring your changes together, save your draft as a version, then combine it with ${target.semver}.`,
  )
  await restorePrompt(page).getByRole('button', { name: 'Restore my draft', exact: true }).click()
  await expandLessons(page)
  await expect(page.locator('#field-lessons__0__overview')).toHaveValue(
    `${MARK}Private restored wording`,
  )
  const before = (
    await fx.payload.count({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: fx.plan.id } },
    })
  ).totalDocs
  await save(page).click()
  await expect(page).toHaveURL(new RegExp(`draftCombineWith=${target.id}$`))
  const intermediateId = Number(new URL(page.url()).pathname.split('/').pop())
  const intermediate = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: intermediateId,
    depth: 0,
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(
    (
      await fx.payload.count({
        collection: 'lesson-bundle-versions',
        where: { lessonPlan: { equals: fx.plan.id } },
      })
    ).totalDocs,
  ).toBe(before + 1)
  await expect(page.getByText('Not Official', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Combine with ${target.semver}`, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`combineWith=${target.id}$`))
  await expect(page.getByRole('dialog')).toContainText(`with version ${target.semver}`)
  await page.getByRole('button', { name: 'Continue in editor', exact: true }).click()
  await expect(page).toHaveURL(
    new RegExp(`/lesson-bundle-versions/${target.id}\\?combineWith=${intermediateId}$`),
  )
  await page.getByRole('button', { name: 'Continue in editor', exact: true }).click()
  await expect(page.locator('.lp-combine')).toBeVisible()
  await expect(save(page)).toBeDisabled()
  await page.getByRole('button', { name: `Use ${intermediate.semver}’s text`, exact: true }).click()
  const response = page.waitForResponse(
    (r) => r.url().includes('/save-as-new') && r.request().method() === 'POST',
  )
  await save(page).click()
  const saved = await response
  expect(saved.status()).toBe(200)
  const finalId = (await saved.json()).id as number
  await expect(page).toHaveURL(new RegExp(`/lesson-bundle-versions/${finalId}$`))
  const combined = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: finalId,
    depth: 0,
  })
  expect(combined.lessons?.[0].overview).toBe(`${MARK}Private restored wording`)
  expect(combined.sourceVersion).toBe(target.id)
  expect(combined.mergedFrom).toBe(intermediateId)
  expect(combined.lessons?.[0].resourceLinks?.[0].fallback_search_url).toBe(
    'http://ares.local/modules/new-release',
  )
  await expect(page.getByText('Not Official', { exact: true })).toBeVisible()
  expect(await official()).toBe(fx.version.id)
  expect(
    await fx.payload.findByID({ collection: 'lesson-bundle-versions', id: intermediateId }),
  ).toBeTruthy()
})

test('a newer sibling teacher version is not offered for an ordinary restored draft', async ({
  page,
}) => {
  const source = await prepare(page)
  await version(fx.version.id, '90.0.1')
  await openEditor(page, source.id)
  await expect(restorePrompt(page)).not.toContainText('To bring your changes')
  await restorePrompt(page).getByRole('button', { name: 'Restore my draft', exact: true }).click()
  await save(page).click()
  await expect(page).not.toHaveURL(new RegExp(`/${source.id}(?:\\?|$)`))
  expect(new URL(page.url()).searchParams.has('draftCombineWith')).toBe(false)
  await expect(page.getByRole('button', { name: /^Combine with / })).toHaveCount(0)
})

test('a target deleted after Save cannot destroy the newly saved text', async ({ page }) => {
  const source = await prepare(page)
  const target = await version(source.id)
  const id = await restoreAndSave(page, source.id)
  await expect(
    page.getByRole('button', { name: `Combine with ${target.semver}`, exact: true }),
  ).toBeVisible()
  await fx.payload.delete({
    collection: 'lesson-bundle-versions',
    id: target.id,
    overrideAccess: true,
  })
  await page.getByRole('button', { name: `Combine with ${target.semver}`, exact: true }).click()
  await expect(page.locator('.lesson-controls__msg[role="alert"]')).toHaveText(
    'Could not load the comparison. Try again.',
  )
  const saved = await fx.payload.findByID({ collection: 'lesson-bundle-versions', id, depth: 0 })
  expect(saved.lessons![0].overview).toBe(`${MARK}Private restored wording`)
  expect(saved.mergedFrom).toBeNull()
  expect(await official()).toBe(fx.version.id)
})

test('discarding the restore offer does not attach a suggestion to fresh edits', async ({
  page,
}) => {
  const source = await prepare(page)
  await version(source.id)
  await openEditor(page, source.id)
  await restorePrompt(page).getByRole('button', { name: 'Discard the draft', exact: true }).click()
  await expandLessons(page)
  await typeProse(page, 'New work after discarding the draft')
  await save(page).click()
  await expect(page).not.toHaveURL(new RegExp(`/${source.id}(?:\\?|$)`))
  expect(new URL(page.url()).searchParams.has('draftCombineWith')).toBe(false)
  await expect(page.getByRole('button', { name: /^Combine with / })).toHaveCount(0)
})

test('untrusted suggestion ids and a caller without editing access cannot expose the shortcut', async ({
  page,
}) => {
  const source = await version()
  const target = await version(source.id)
  const otherPlan = await fx.payload.create({
    collection: 'lesson-plans',
    data: { title: `${MARK}other shortcut plan`, subjectGrade: fx.subjectGrade.id },
    overrideAccess: true,
  })
  const foreign = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      ...minimalBundleContent(),
      title: `${MARK}foreign`,
      semver: '1.0.0',
      lessonPlan: otherPlan.id,
      subjectGrade: fx.subjectGrade.id,
    } as never,
    overrideAccess: true,
  })
  await loginAs(page, fx, 'editor')
  for (const value of ['bad', source.id, foreign.id]) {
    await page.goto(
      `${BASE}/admin/collections/lesson-bundle-versions/${source.id}?draftCombineWith=${value}`,
    )
    await expect(page.getByRole('button', { name: /^Combine with / })).toHaveCount(0)
  }
  await page.context().clearCookies()
  await loginAs(page, fx, 'teacher')
  await page.goto(
    `${BASE}/admin/collections/lesson-bundle-versions/${source.id}?draftCombineWith=${target.id}`,
  )
  await expect(page.getByRole('button', { name: /^Combine with / })).toHaveCount(0)
})
