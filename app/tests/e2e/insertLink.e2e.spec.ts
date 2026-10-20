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

async function edit(page: Page, role: 'editor' | 'subjectAdmin' = 'editor') {
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
  await loginAs(page, fx, role)
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
  await column(page).fill('Beforeafter')
  await column(page).press('Home')
  for (let i = 0; i < 6; i++) await column(page).press('ArrowRight')
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

test('keeps a demo tracker address as copied, on ares.local, without a label', async ({ page }) => {
  await edit(page)
  await column(page).fill('')
  await openLink(page)
  await page
    .getByLabel('Web address')
    .fill(
      'https://demo.aresedu.dev/tracker/local_launch.html?target=%2Fkolibri%2Fen%2Flearn%2F%23%2Ftopics%2Fc%2Fabc',
    )
  await page.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(column(page)).toHaveValue(
    '(http://ares.local/tracker/local_launch.html?target=%2Fkolibri%2Fen%2Flearn%2F%23%2Ftopics%2Fc%2Fabc)',
  )
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

test('an unavailable PDF folder never blocks a pasted address', async ({ page }) => {
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
  await expect(page.getByRole('region', { name: 'PDFs on the Rock' })).toBeVisible()
  await page.getByLabel('Web address').fill('http://ares.local/modules/a.pdf')
  await page.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(column(page)).toHaveValue(/\(http:\/\/ares.local\/modules\/a.pdf\)/)
})

test('a pending PDF request is cancelled when a web address is inserted', async ({ page }) => {
  await edit(page)
  let release!: () => void
  const gate = new Promise<void>((done) => {
    release = done
  })
  let started!: () => void
  const requested = new Promise<void>((done) => {
    started = done
  })
  await page.route('**/api/resource-library', async (route) => {
    started()
    await gate
    await route.fulfill({ json: { configured: true, files: [] } }).catch(() => {})
  })
  await openLink(page)
  await requested
  await expect(page.getByRole('region', { name: 'PDFs on the Rock' })).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await expect(page.getByText('No PDF files are available.')).toHaveCount(0)
  await page.getByLabel('Web address').fill('http://ares.local/modules/pending.pdf')
  await page.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(column(page)).toHaveValue(/\(http:\/\/ares.local\/modules\/pending.pdf\)/)
  release()
})

test('closing and reopening ignores a late PDF error and makes a fresh request', async ({
  page,
}) => {
  await edit(page)
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>((done) => {
    release = done
  })
  let finished!: () => void
  const oldFinished = new Promise<void>((done) => {
    finished = done
  })
  await page.route('**/api/resource-library', async (route) => {
    if (++calls === 1) {
      await gate
      await route.fulfill({ status: 503, json: { error: 'Old failure' } }).catch(() => {})
      finished()
    } else await route.fulfill({ json: { configured: true, files: [] } })
  })
  await openLink(page)
  await expect.poll(() => calls).toBe(1)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await openLink(page)
  await expect(page.getByText('No PDF files are available.')).toBeVisible()
  expect(calls).toBe(2)
  release()
  await oldFinished
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'PDFs on the Rock' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
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

for (const activation of ['click', 'Enter', 'Space'] as const) {
  test(`Insert link keeps its field when activated with ${activation}`, async ({ page }) => {
    await edit(page)
    await column(page).fill('Watch this')
    await column(page).press('End')
    if (activation === 'click') await insertButton(page).click()
    else {
      await insertButton(page).focus()
      await expect(insertButton(page)).toBeEnabled()
      await insertButton(page).press(activation)
    }
    const dialog = page.getByRole('dialog', { name: 'Insert link' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Web address').fill('https://example.org/video')
    await dialog.getByLabel('Label (optional)').fill('Video')
    await dialog.getByRole('button', { name: 'Insert address', exact: true }).click()
    await expect(column(page)).toHaveValue('Watch this Video (https://example.org/video)')
    await expect(column(page)).toBeFocused()
  })
}

test('moving to a phase dropdown clears the link target', async ({ page }) => {
  await edit(page, 'subjectAdmin')
  await column(page).click()
  await expect(insertButton(page)).toBeEnabled()
  await page.locator('#field-lessons__0__framework__0__phase').click()
  await expect(insertButton(page)).toBeDisabled()
})

test('labels refuse real links and line markup while preserving harmless web-like text', async ({
  page,
}) => {
  await edit(page)
  await column(page).fill('')
  await openLink(page)
  const dialog = page.getByRole('dialog', { name: 'Insert link' })
  await dialog.getByLabel('Web address').fill('https://example.org/video')
  for (const [label, message] of [
    [
      'See (https://evil.example) notes',
      'Keep web addresses out of the label. Use the Web address box.',
    ],
    [
      '- Video',
      'A label can\'t start with "- " or "|". Those turn the line into a bullet or a table.',
    ],
    [
      '| Video',
      'A label can\'t start with "- " or "|". Those turn the line into a bullet or a table.',
    ],
  ]) {
    await dialog.getByLabel('Label (optional)').fill(label)
    await dialog.getByRole('button', { name: 'Insert address', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText(message)
    await expect(dialog.getByLabel('Label (optional)')).toHaveValue(label)
    await expect(column(page)).toHaveValue('')
  }
  await dialog.getByLabel('Label (optional)').fill('PhET simulation at phet.colorado.edu')
  await dialog.getByRole('button', { name: 'Insert address', exact: true }).click()
  await expect(column(page)).toHaveValue(
    'PhET simulation at phet.colorado.edu (https://example.org/video)',
  )
})
