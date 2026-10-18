import { test, expect, type Page } from '@playwright/test'
import { setupRoleFixture, minimalBundleContent, type RoleFixture } from '../helpers/fixtures'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import {
  awaitCaptured,
  restorePrompt,
  openEditor,
  expandLessons,
  typeProse,
} from '../helpers/editRecoveryUi'
import { recoveryRow } from '../helpers/editRecovery'

let fx: RoleFixture
let sequence = 0
test.beforeAll(async () => {
  fx = await setupRoleFixture()
})
test.afterAll(async () => {
  await fx?.teardown()
})
async function version(
  overview: string,
  options: {
    duration?: string
    reflection?: string
    source?: number | null
    extraPhase?: boolean
  } = {},
) {
  const content = minimalBundleContent()
  content.lessons[0].overview = overview
  if (options.extraPhase) content.lessons[0].framework.push({ ...content.lessons[0].framework[0] })
  if (options.duration) content.lessons[0].duration = options.duration
  if (options.reflection) content.lessons[0].teacherReflection = options.reflection
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      ...content,
      title: fx.version.title,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: `50.${++sequence}.0`,
      ...(options.source === null ? {} : { sourceVersion: options.source ?? fx.version.id }),
    } as never,
  })
}
async function review(page: Page, a: number, b: number) {
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${a}`)
  await page.getByRole('button', { name: 'Combine versions', exact: true }).click()
  await page.getByLabel('Choose another version').selectOption(String(b))
  await page.getByRole('button', { name: 'Review combination', exact: true }).click()
}
async function begin(page: Page, a: number, b: number) {
  await review(page, a, b)
  await page.getByRole('button', { name: 'Continue in editor', exact: true }).click()
  await expect(page.locator('.lp-combine')).toBeVisible()
}
const saveButton = (page: Page) =>
  page.getByRole('button', { name: 'Save as new version', exact: true })

test('Combine requires editing access and at least two versions', async ({ page }) => {
  await loginAs(page, fx, 'editor')
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${fx.version.id}`)
  await expect(page.getByRole('button', { name: 'Combine versions', exact: true })).toHaveCount(0)
  await version('Second version')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Combine versions', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 640, height: 900 })
  await page.getByRole('button', { name: 'Combine versions', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('wider screen')
})

test('a Teacher without editing access has no Combine button', async ({ page }) => {
  await loginAs(page, fx, 'teacher')
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${fx.version.id}`)
  await expect(page.getByRole('button', { name: 'Combine versions', exact: true })).toHaveCount(0)
})

test('choices can change until Save; the result is Not Official and neither parent is deleted', async ({
  page,
}) => {
  const a = await version('First text')
  const b = await version('Second text')
  const before = await fx.payload.count({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: fx.plan.id } },
  })
  await loginAs(page, fx, 'editor')
  await begin(page, a.id, b.id)
  await expect(saveButton(page)).toBeDisabled()
  expect(
    (
      await fx.payload.count({
        collection: 'lesson-bundle-versions',
        where: { lessonPlan: { equals: fx.plan.id } },
      })
    ).totalDocs,
  ).toBe(before.totalDocs)
  await page.getByRole('button', { name: `Use ${b.semver}’s text`, exact: true }).click()
  await expect(saveButton(page)).toBeEnabled()
  await page.getByRole('button', { name: `Use ${a.semver}’s text`, exact: true }).click()
  await page.getByRole('button', { name: 'Write my own', exact: true }).click()
  const own = page.locator('.lp-combine textarea')
  await expect(own).toHaveValue('First text')
  await own.fill('Teacher combined text')
  await page.screenshot({ path: 'test-results/combine-editor.png' })
  page.on('dialog', async (dialog) => {
    throw new Error(`Unexpected delete offer: ${dialog.message()}`)
  })
  const response = page.waitForResponse(
    (r) => r.url().includes('/save-as-new') && r.request().method() === 'POST',
  )
  await saveButton(page).click()
  const res = await response
  expect(res.status()).toBe(200)
  const saved = await res.json()
  await expect(page).toHaveURL(new RegExp(`/lesson-bundle-versions/${saved.id}$`))
  const result = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: saved.id,
    depth: 0,
  })
  expect(result.lessons?.[0].overview).toBe('Teacher combined text')
  expect(result.sourceVersion).toBe(a.id)
  expect(result.mergedFrom).toBe(b.id)
  const plan = await fx.payload.findByID({ collection: 'lesson-plans', id: fx.plan.id, depth: 0 })
  expect(plan.officialVersion).toBe(fx.version.id)
  await expect(page.locator('.lesson-controls')).toContainText('Not Official')
  await expect(page.locator('.lp-combine')).toHaveCount(0)
  expect((await fx.payload.findByID({ collection: 'lesson-bundle-versions', id: a.id })).id).toBe(
    a.id,
  )
  expect((await fx.payload.findByID({ collection: 'lesson-bundle-versions', id: b.id })).id).toBe(
    b.id,
  )
})

test('switches the version and URL to preserve the engine-selected plan details', async ({
  page,
}) => {
  const a = await version('Changed prose')
  const b = await version('A minimal generatable lesson.', { duration: '45 min' })
  await loginAs(page, fx, 'editor')
  await review(page, a.id, b.id)
  await expect(page.getByRole('dialog')).toContainText(`Continue in version ${b.semver}`)
  await page.getByRole('button', { name: 'Continue in editor', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/lesson-bundle-versions/${b.id}\\?combineWith=${a.id}$`))
  await page.getByRole('button', { name: 'Continue in editor', exact: true }).click()
  await expect(saveButton(page)).toBeEnabled()
  await page.getByRole('button', { name: 'Show All', exact: true }).first().click()
  await expect(page.locator('#field-lessons__0__overview')).toHaveValue('Changed prose')
  const savedResponse = page.waitForResponse(
    (r) => r.url().includes('/save-as-new') && r.request().method() === 'POST',
  )
  await saveButton(page).click()
  const response = await savedResponse
  expect(response.status()).toBe(200)
  const saved = await response.json()
  const result = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: saved.id,
    depth: 0,
  })
  expect(result.lessons?.[0].duration).toBe('45 min')
  expect(result.sourceVersion).toBe(b.id)
  expect(result.mergedFrom).toBe(a.id)
})

test('explains when a descendant already includes the selected version', async ({ page }) => {
  const descendant = await version('Descendant text')
  await loginAs(page, fx, 'editor')
  await review(page, fx.version.id, descendant.id)
  await expect(page.getByRole('dialog')).toContainText(
    `Version ${descendant.semver} already includes everything in ${fx.version.semver}. Nothing to combine.`,
  )
  await expect(page.getByRole('button', { name: 'Continue in editor', exact: true })).toHaveCount(0)
})

test('restores Combine metadata and only asks for unresolved choices', async ({ page }) => {
  const a = await version('First draft text', { reflection: 'First reflection' })
  const b = await version('Second draft text', { reflection: 'Second reflection' })
  await loginAs(page, fx, 'editor')
  await begin(page, a.id, b.id)
  await page
    .getByRole('button', { name: `Use ${b.semver}’s text`, exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Continue editing', exact: true }).click()
  await restorePrompt(page).getByRole('button', { name: 'Restore my draft', exact: true }).click()
  await expect(page.locator('.lp-combine')).toContainText('Fields needing your choice: 1')
  await expect(saveButton(page)).toBeDisabled()
  await page
    .getByRole('button', { name: `Use ${a.semver}’s text`, exact: true })
    .last()
    .click()
  await expect(saveButton(page)).toBeEnabled()
  await awaitCaptured(page)
  await fx.payload.delete({ collection: 'lesson-bundle-versions', id: b.id, overrideAccess: true })
  await page.reload()
  await page.getByRole('button', { name: 'Continue editing', exact: true }).click()
  await restorePrompt(page).getByRole('button', { name: 'Restore my draft', exact: true }).click()
  await expect(
    page.getByText(
      'The other version is no longer available. Your saved text has been restored as an ordinary draft.',
    ),
  ).toBeVisible()
  await expect(page.locator('.lp-combine')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible()

  // A second-parent deletion while the editor is still open also explains the failed Save.
  const liveSource = await version('Live starting text')
  const liveOther = await version('Live other text')
  await begin(page, liveSource.id, liveOther.id)
  await page.getByRole('button', { name: `Use ${liveOther.semver}’s text`, exact: true }).click()
  await awaitCaptured(page)
  await fx.payload.delete({
    collection: 'lesson-bundle-versions',
    id: liveOther.id,
    overrideAccess: true,
  })
  await saveButton(page).click()
  await expect(
    page.getByText(
      'The other version is no longer available. Your saved text has been restored as an ordinary draft.',
    ),
  ).toBeVisible()
  await expect(page.locator('.lp-combine')).toHaveCount(0)
  expect((await recoveryRow(fx.payload, liveSource.id, fx.users.editor.id))?.retired_at).toBeNull()
})

test('deleting the editing source deletes the draft and leaves open text available for copying', async ({
  page,
}) => {
  const a = await version('Text to keep on screen')
  const b = await version('Other text')
  await loginAs(page, fx, 'editor')
  await begin(page, a.id, b.id)
  await page.getByRole('button', { name: `Use ${b.semver}’s text`, exact: true }).click()
  await awaitCaptured(page)
  await fx.payload.delete({ collection: 'lesson-bundle-versions', id: a.id, overrideAccess: true })
  expect(await recoveryRow(fx.payload, a.id, fx.users.editor.id)).toBeUndefined()
  await saveButton(page).click()
  await expect(
    page.getByText(
      'The version you were editing was deleted. Your text is still on screen. Copy it before leaving this page.',
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Show All', exact: true }).first().click()
  await expect(page.locator('#field-lessons__0__overview')).toHaveValue('Other text')
  expect(await recoveryRow(fx.payload, a.id, fx.users.editor.id)).toBeUndefined()
})

test('offers an earlier draft before applying a new Combine overlay', async ({ page }) => {
  const a = await version('Saved starting text')
  const b = await version('Text from the other version')
  await loginAs(page, fx, 'editor')
  await openEditor(page, a.id)
  await expandLessons(page)
  await typeProse(page, 'Earlier private draft')
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible()
  await review(page, a.id, b.id)
  await page.getByRole('button', { name: 'Continue in editor', exact: true }).click()
  await expect(restorePrompt(page)).toContainText('Earlier private draft')
  await restorePrompt(page).getByRole('button', { name: 'Discard the draft', exact: true }).click()
  await expect(page.locator('.lp-combine')).toContainText('Fields needing your choice: 1')
  await page.getByRole('button', { name: `Use ${b.semver}’s text`, exact: true }).click()
  await expect(saveButton(page)).toBeEnabled()
})

test('explains a missing common version and an unreliable structure', async ({ page }) => {
  const a = await version('Unrelated first text', { source: null })
  const b = await version('Unrelated second text', { source: null })
  await loginAs(page, fx, 'editor')
  await review(page, a.id, b.id)
  await expect(page.getByRole('dialog')).toContainText(
    'No usable common version was found. Choose which text to keep wherever these versions differ.',
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const different = await version('Different structure', { extraPhase: true })
  await review(page, a.id, different.id)
  await expect(page.getByRole('dialog')).toContainText(
    'These rows cannot be matched reliably. They may have been reordered, renamed, or repeated. Open one version and copy across the changes you need.',
  )
  await expect(page.getByRole('button', { name: 'Continue in editor', exact: true })).toHaveCount(0)
})
