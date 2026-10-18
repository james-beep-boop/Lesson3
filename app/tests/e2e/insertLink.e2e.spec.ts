import { test, expect, type Page } from '@playwright/test'
import { loginAs } from '../helpers/e2e'
import { setupRoleFixture, minimalBundleContent, type RoleFixture } from '../helpers/fixtures'
import { recoveryRow } from '../helpers/editRecovery'
import { openEditor, expandLessons, awaitCaptured } from '../helpers/editRecoveryUi'

let fx: RoleFixture
let sequence = 0
const column = (page: Page, name = 'learnerExperience') =>
  page.locator(`#field-lessons__0__framework__0__${name}`)
const insertButton = (page: Page) => page.getByRole('button', { name: 'Insert link', exact: true })

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})
test.afterAll(async () => {
  await fx?.teardown()
})

async function edit(page: Page) {
  const version = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      ...minimalBundleContent(),
      title: fx.version.title,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      sourceVersion: fx.version.id,
      semver: `70.${++sequence}.0`,
    } as never,
  })
  await loginAs(page, fx, 'editor')
  await openEditor(page, version.id)
  await expandLessons(page)
  for (const button of await page.getByRole('button', { name: 'Show All', exact: true }).all()) {
    if (await button.isVisible()) await button.click()
  }
  await expect(column(page)).toBeVisible()
  return version.id
}

async function openLink(page: Page) {
  await column(page).click()
  await insertButton(page).click()
  await expect(page.getByRole('dialog', { name: 'Insert link' })).toBeVisible()
}

test('only the four framework columns enable Insert link, and other prose clears the target', async ({
  page,
}) => {
  await edit(page)
  await expect(insertButton(page)).toBeDisabled()
  await page.locator('#field-lessons__0__overview').click()
  await expect(insertButton(page)).toBeDisabled()
  for (const field of [
    'learnerExperience',
    'teacherMoves',
    'sensemakingStrategy',
    'formativeAssessment',
  ]) {
    await column(page, field).click()
    await expect(insertButton(page)).toBeEnabled()
  }
  await page.locator('#field-lessons__0__overview').click()
  await expect(insertButton(page)).toBeDisabled()
})

test('inserts labelled HTTP ARES text at the cursor, restores focus and captures it as prose', async ({
  page,
}) => {
  const versionId = await edit(page)
  await column(page).fill('Before  after')
  await column(page).press('Home')
  for (let i = 0; i < 7; i++) await column(page).press('ArrowRight')
  await insertButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Insert link' })
  await expect(dialog).toContainText('New feature.')
  await dialog.getByLabel('Web address').fill('http://ares.local/modules/plant.pdf')
  await dialog.getByLabel('Label (optional)').fill('  Plant transport video  ')
  await dialog.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(column(page)).toHaveValue(
    'Before Plant transport video (http://ares.local/modules/plant.pdf) after',
  )
  await expect(column(page)).toBeFocused()
  await awaitCaptured(page)
  await expect
    .poll(async () =>
      JSON.stringify((await recoveryRow(fx.payload, versionId, fx.users.editor.id))?.content),
    )
    .toContain('Plant transport video (http://ares.local/modules/plant.pdf)')
})

test('unwraps a demo tracker into stored Kolibri form without a label', async ({ page }) => {
  await edit(page)
  await column(page).fill('')
  await openLink(page)
  await page
    .getByLabel('Web address')
    .fill(
      'https://demo.aresedu.dev/tracker/local_launch.html?target=%2Fkolibri%2Fen%2Flearn%2F%23%2Ftopics%2Fc%2Fabc',
    )
  await page.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(column(page)).toHaveValue('(http://ares.local:8069/en/learn/#/topics/c/abc)')
})

test('invalid addresses and long labels keep the dialog open with actionable errors', async ({
  page,
}) => {
  await edit(page)
  await openLink(page)
  await page.getByLabel('Web address').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Insert link' }).getByRole('alert')).toContainText(
    'Enter a complete web address starting with http:// or https://.',
  )
  await page.getByLabel('Web address').fill('https://example.org/a')
  await page.getByLabel('Label (optional)').fill('x'.repeat(121))
  await page.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Insert link' }).getByRole('alert')).toContainText(
    'Keep the label to 120 characters or fewer.',
  )
})

test('an unconfigured or unreadable PDF folder is hidden and never blocks a pasted address', async ({
  page,
}) => {
  await edit(page)
  await page.route('**/api/resource-library', (route) =>
    route.fulfill({ json: { configured: false, files: [] } }),
  )
  await openLink(page)
  await expect(page.getByRole('dialog')).not.toContainText('PDFs on the Rock')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.route('**/api/resource-library', (route) =>
    route.fulfill({ status: 503, json: { error: 'The PDF library is unavailable.' } }),
  )
  await openLink(page)
  await expect(page.getByRole('dialog', { name: 'Insert link' }).getByRole('alert')).toContainText(
    'You can still paste a web address.',
  )
  await expect(page.getByRole('dialog')).not.toContainText('PDFs on the Rock')
  await page.getByLabel('Web address').fill('http://ares.local/modules/a.pdf')
  await page.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(column(page)).toHaveValue(/\(http:\/\/ares.local\/modules\/a.pdf\)/)
})

test('a configured PDF picker inserts the optional label and an absolute document link', async ({
  page,
}) => {
  await edit(page)
  await column(page).fill('')
  await page.route('**/api/resource-library', (route) =>
    route.fulfill({
      json: {
        configured: true,
        files: [
          { name: 'Plants.pdf', size: 1024, href: '/api/resource-library/file/UGxhbnRzLnBkZg' },
        ],
      },
    }),
  )
  await openLink(page)
  await expect(page.getByRole('dialog')).toContainText('PDFs on the Rock')
  await page.getByLabel('Label (optional)').fill('Plants reading')
  await page.getByRole('button', { name: /Plants.pdf/ }).click()
  await expect(column(page)).toHaveValue(
    /Plants reading \(http:\/\/[^)]+\/api\/resource-library\/file\/UGxhbnRzLnBkZg\)/,
  )
})

test('normalizes URL syntax while keeping an unconfigured ARES service port', async ({ page }) => {
  await edit(page)
  await column(page).fill('')
  await openLink(page)
  await page.getByLabel('Web address').fill('HTTP://ARES.LOCAL:8082/a b')
  await page.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(column(page)).toHaveValue('(http://ares.local:8082/a%20b)')
})
