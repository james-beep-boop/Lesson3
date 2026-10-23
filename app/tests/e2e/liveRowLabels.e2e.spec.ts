/**
 * Typing-speed patch, end to end (docs/PLAN-editing-typing-speed-2026-10-23.md §4.2–§4.3 and §5).
 *
 * The patched `RowLabelProvider` no longer re-renders every row on every keystroke, so Lesson3's
 * RowLabel subscribes to the one field it shows. These checks pin what a Subject Administrator sees:
 *
 *   - typing a lesson title updates its row label while typing, not after the server round trip;
 *   - clearing the title shows "Lesson N", never the old title;
 *   - after adding, removing and reordering rows, every label matches its own row.
 *
 * And, because the patch changes when form subscribers re-render: text typed quickly and saved at
 * once is stored exactly as typed.
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from '../helpers/e2e'
import { openEditor, expandLessons, OVERVIEW } from '../helpers/editRecoveryUi'
import { minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import type { LessonBundleVersion } from '../../src/payload-types'

let fx: RoleFixture
let source: LessonBundleVersion
// The save check gets its own version, so it never meets the label check's document lock.
let saveSource: LessonBundleVersion
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  const content = minimalBundleContent()
  const [lesson] = content.lessons
  content.lessons = [
    { ...lesson!, title: 'Alpha' },
    { ...structuredClone(lesson!), title: 'Beta' },
  ]
  const create = (semver: string) =>
    fx.payload.create({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      data: {
        ...structuredClone(content),
        title: fx.version.title,
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver,
      } as never,
    })
  source = await create('2.0.0')
  saveSource = await create('2.1.0')
})
test.afterAll(async () => {
  await fx?.teardown()
})

// `#lessons-row-N` wraps the whole lesson row. Its first `.array-field__row-header` holds the custom
// RowLabel, and its first actions menu is the lesson's own, ahead of nested (framework) rows' menus.
const label = (page: Page, row: number) =>
  page.locator(`#lessons-row-${row} .array-field__row-header`).first()

async function rowAction(page: Page, row: number, action: string) {
  await page
    .locator(`#lessons-row-${row} .array-actions__button`)
    .first()
    .click({ timeout: 10_000 })
  // Every row's menu is in the DOM, hidden; only the one just opened is visible.
  await page
    .locator('.array-actions__action', { hasText: action })
    .filter({ visible: true })
    .first()
    .click({ timeout: 10_000 })
}

test('lesson row labels stay live while typing, clearing, adding, removing and reordering', async ({
  page,
}) => {
  test.setTimeout(120_000)
  page.on('pageerror', (error) => console.error(error.message))
  await loginAs(page, fx, 'subjectAdmin')
  await openEditor(page, source.id)
  await expandLessons(page)
  await page.waitForLoadState('networkidle')

  await test.step('labels start from the stored titles', async () => {
    await expect(label(page, 0)).toHaveText('Lesson 1 — Alpha')
    await expect(label(page, 1)).toHaveText('Lesson 2 — Beta')
  })

  const title = page.locator('#field-lessons__0__title')
  await test.step('typing a title updates its label on each keystroke', async () => {
    // Each check allows 1 s, well inside the pause before Payload's server form-state round trip,
    // which is what the label waited for with the provider patch alone.
    await title.click()
    await page.keyboard.press('End')
    for (const [key, expected] of [
      [' ', 'Lesson 1 — Alpha'],
      ['P', 'Lesson 1 — Alpha P'],
      ['r', 'Lesson 1 — Alpha Pr'],
    ] as const) {
      await page.keyboard.type(key)
      await expect(label(page, 0)).toHaveText(expected, { timeout: 1_000 })
    }
  })

  await test.step('a cleared title shows the noun and number, never the old title', async () => {
    await title.fill('')
    await expect(label(page, 0)).toHaveText('Lesson 1', { timeout: 1_000 })
    await title.fill('Gamma')
    await expect(label(page, 0)).toHaveText('Lesson 1 — Gamma', { timeout: 1_000 })
  })

  await test.step('adding a row below the last gives an empty third lesson', async () => {
    await rowAction(page, 1, 'Add Below')
    await expect(label(page, 2)).toHaveText('Lesson 3', { timeout: 15_000 })
    await expect(label(page, 0)).toHaveText('Lesson 1 — Gamma')
    await expect(label(page, 1)).toHaveText('Lesson 2 — Beta')
  })

  await test.step('removing the first row renumbers the rest', async () => {
    await rowAction(page, 0, 'Remove')
    await expect(label(page, 0)).toHaveText('Lesson 1 — Beta', { timeout: 15_000 })
    await expect(label(page, 1)).toHaveText('Lesson 2', { timeout: 15_000 })
    await expect(page.locator('#lessons-row-2')).toHaveCount(0)
  })

  await test.step('moving a row down keeps each label with its row', async () => {
    await rowAction(page, 0, 'Move Down')
    await expect(label(page, 0)).toHaveText('Lesson 1', { timeout: 15_000 })
    await expect(label(page, 1)).toHaveText('Lesson 2 — Beta', { timeout: 15_000 })
  })

  await test.step('the moved row stays live at its new path', async () => {
    await page.locator('#field-lessons__1__title').click()
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    await expect(label(page, 1)).toHaveText('Lesson 2 — Beta!', { timeout: 1_000 })
  })
  await page.screenshot({ path: 'test-results/live-row-labels.png' })
})

test('prose typed quickly and saved at once is stored exactly as typed', async ({ page }) => {
  test.setTimeout(90_000)
  page.on('pageerror', (error) => console.error(error.message))
  await loginAs(page, fx, 'editor')
  await openEditor(page, saveSource.id)
  await expandLessons(page)
  await page.waitForLoadState('networkidle')

  const typed = ' Quickly typed, then saved straight away.'
  const overview = page.locator(OVERVIEW)
  await overview.click()
  await page.keyboard.press('End')
  await page.keyboard.type(typed) // no delay between keys
  await page.getByRole('button', { name: 'Save as new version', exact: true }).click()
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith('/admin/collections/lesson-bundle-versions/') &&
      !url.pathname.endsWith(`/${saveSource.id}`),
  )
  const savedId = Number(new URL(page.url()).pathname.split('/').pop())
  const saved = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: savedId,
    depth: 0,
  })
  expect(saved.lessons![0].overview).toBe(`${saveSource.lessons![0].overview}${typed}`)
})
