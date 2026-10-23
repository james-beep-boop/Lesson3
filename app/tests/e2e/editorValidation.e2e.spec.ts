import { test, expect } from '@playwright/test'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { openEditor, expandLessons } from '../helpers/editRecoveryUi'
import { minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { PHASE_VALUES } from '../../src/fields/phases'
import type { LessonBundleVersion } from '../../src/payload-types'

let fx: RoleFixture
let source: LessonBundleVersion
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  const content = minimalBundleContent()
  content.lessons[0].framework = PHASE_VALUES.map((phase) => ({
    ...content.lessons[0].framework[0],
    phase,
  }))
  source = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      ...content,
      title: fx.version.title,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '2.0.0',
    } as never,
  })
  await fx.payload.update({
    collection: 'lesson-plans',
    id: fx.plan.id,
    data: { officialVersion: source.id },
    overrideAccess: true,
  })
})
test.afterAll(async () => {
  await fx?.teardown()
})

test('an unfinished sixth phase is identified before saving, and a chosen sixth phase saves', async ({
  page,
}) => {
  test.setTimeout(90_000)
  page.on('pageerror', (error) => console.error(error.message))
  await loginAs(page, fx, 'siteAdmin')

  // The server must still reject a client that bypasses the form validation, with an actual path.
  const incomplete = structuredClone(source)
  incomplete.lessons![0].framework!.push({ phase: null } as never)
  const refused = await page.request.post(
    `${BASE}/api/lesson-bundle-versions/${source.id}/save-as-new`,
    {
      multipart: { data: JSON.stringify(incomplete) },
    },
  )
  expect(refused.status()).toBe(400)
  const failure = await refused.json()
  expect(failure.errors[0].data.errors).toContainEqual(
    expect.objectContaining({
      path: 'lessons.0.framework.5.phase',
      label: 'Lesson 1, phase 6',
      message: 'Lesson 1, phase 6: Choose a phase from the list.',
    }),
  )

  await openEditor(page, source.id)
  await expandLessons(page)
  // Payload refreshes form state after expanding rows. Finish that initial refresh before adding
  // a row, so its older five-row snapshot cannot race the structural edit in this test.
  await page.waitForLoadState('networkidle')
  const framework = page.locator('#field-lessons__0__framework')
  await framework.getByRole('button', { name: 'Add Phase', exact: true }).click()
  const phase = page.locator('select[name="lessons.0.framework.5.phase"]')
  await expect(phase).toHaveValue('', { timeout: 15_000 })
  await expect(phase.locator('option')).toHaveCount(6)
  await expect(phase.locator('..').getByRole('textbox')).toHaveCount(0)

  // It must reveal a collapsed invalid row as well as explain the error in the toolbar.
  const row = page.locator('#lessons-0-framework-row-5')
  await row.locator('.collapsible__toggle').first().click()
  let saves = 0
  page.on('request', (request) => {
    if (request.url().includes('/save-as-new')) saves++
  })
  await page.getByRole('button', { name: 'Save as new version', exact: true }).click()
  await expect(page.locator('.lesson-controls__msg')).toContainText(
    'Lesson 1, phase 6: Choose a phase from the list.',
  )
  await expect(phase).toBeVisible()
  await expect(phase).toBeFocused()
  await expect(phase).toHaveAttribute('aria-invalid', 'true')
  await expect(phase.locator('..').locator('.lp-phase-select__error')).toContainText(
    'Choose a phase',
  )
  expect(saves).toBe(0)
  await page.screenshot({ path: 'test-results/phase-validation.png' })

  await phase.selectOption(PHASE_VALUES[0])
  await page.getByRole('button', { name: 'Save as new version', exact: true }).click()
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith('/admin/collections/lesson-bundle-versions/') &&
      !url.pathname.endsWith(`/${source.id}`),
  )
  expect(saves).toBe(1)
  const savedId = Number(new URL(page.url()).pathname.split('/').pop())
  const saved = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: savedId,
    depth: 0,
  })
  expect(saved.lessons![0].framework).toHaveLength(6)
  expect(saved.lessons![0].framework![5].phase).toBe(PHASE_VALUES[0])
  const original = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: source.id,
    depth: 0,
  })
  expect(original.lessons![0].framework).toHaveLength(5)
})
