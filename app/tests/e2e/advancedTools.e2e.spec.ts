/**
 * Standard / Advanced tools (2026-10-20) — what a teacher sees in each mode, and the promises the
 * switch makes: it is display only, it never touches anyone's drafts, and it never strands a Combine
 * that was already under way. The Save endpoint's own authorization is `systemSettings.http.spec.ts`.
 */
import { test, expect, type Page } from '@playwright/test'
import {
  setAdvancedTools,
  setupRoleFixture,
  minimalBundleContent,
  type RoleFixture,
} from '../helpers/fixtures'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { openEditor, restorePrompt } from '../helpers/editRecoveryUi'
import { recoveryRow } from '../helpers/editRecovery'

let fx: RoleFixture
let sequence = 0
test.beforeAll(async () => {
  fx = await setupRoleFixture()
})
test.afterAll(async () => {
  if (fx) await setAdvancedTools(fx.payload, false)
  await fx?.teardown()
})

async function version(overview: string, reflection?: string) {
  const content = minimalBundleContent()
  content.lessons[0].overview = overview
  if (reflection) content.lessons[0].teacherReflection = reflection
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      ...content,
      title: fx.version.title,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: `70.${++sequence}.0`,
      sourceVersion: fx.version.id,
    } as never,
  })
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const more = (page: Page) => button(page, 'More ▾')

async function openShare(page: Page) {
  await page.goto(`${BASE}/lessons/${fx.plan.id}`)
  await button(page, 'Share ▾').click()
  await expect(button(page, 'Download all — PDF (.zip)')).toBeVisible()
}

test('Standard hides the advanced tools and keeps Insert link', async ({ page }) => {
  await setAdvancedTools(fx.payload, false)
  await version('A second version, so Combine would otherwise be offered')
  await loginAs(page, fx, 'editor')
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${fx.version.id}`)
  await expect(button(page, 'Edit')).toBeVisible()
  await expect(more(page)).toHaveCount(0)
  await expect(button(page, 'Show details')).toHaveCount(0)
  await expect(button(page, 'Combine versions')).toHaveCount(0)
  await openEditor(page, fx.version.id)
  await expect(button(page, 'Insert link')).toBeVisible()

  await openShare(page)
  await expect(button(page, 'Download as JSON')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Email all/ })).toHaveCount(0)
})

test('Advanced adds More (Combine versions, Show details) and Download as JSON, never Email without email set up', async ({
  page,
}) => {
  await setAdvancedTools(fx.payload, true)
  await version('A second version, so Combine is offered')
  await loginAs(page, fx, 'editor')
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${fx.version.id}`)
  await more(page).click()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(button(page, 'Combine versions')).toBeVisible()
  await button(page, 'Show details').click()
  await more(page).click()
  await expect(button(page, 'Hide details')).toBeVisible()

  // Laptop widths: the extra button must not push the row off the screen.
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 })
    const rect = await more(page).boundingBox()
    expect(rect!.x + rect!.width, `More ▾ at ${width}px`).toBeLessThanOrEqual(width)
  }

  await openShare(page)
  await expect(button(page, 'Download as JSON')).toBeVisible()
  // The test stack has no email server: Advanced must not offer what cannot work.
  await expect(page.getByRole('button', { name: /^Email all/ })).toHaveCount(0)
})

test('an unfinished Combine survives a switch to Standard, and the switch leaves the draft untouched', async ({
  page,
}) => {
  await setAdvancedTools(fx.payload, true)
  const a = await version('First text', 'First reflection')
  const b = await version('Second text', 'Second reflection')
  await loginAs(page, fx, 'editor')
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${a.id}`)
  await more(page).click()
  await button(page, 'Combine versions').click()
  await page.getByLabel('Choose another version').selectOption(String(b.id))
  await button(page, 'Review combination').click()
  await button(page, 'Continue in editor').click()
  await expect(page.locator('.lp-combine')).toBeVisible()
  await button(page, `Use ${b.semver}’s text`).first().click()
  await button(page, 'Save as draft').click()
  await expect(button(page, 'Continue editing')).toBeVisible()

  const before = await recoveryRow(fx.payload, a.id, fx.users.editor.id)
  expect(before, 'the Combine draft was saved').toBeTruthy()
  await setAdvancedTools(fx.payload, false)
  expect(await recoveryRow(fx.payload, a.id, fx.users.editor.id)).toEqual(before)

  // Standard: nothing offers to START a Combine, but this one carries on.
  await page.reload()
  await expect(more(page)).toHaveCount(0)
  await button(page, 'Continue editing').click()
  await restorePrompt(page).getByRole('button', { name: 'Restore my draft', exact: true }).click()
  await expect(page.locator('.lp-combine')).toContainText('Fields needing your choice: 1')
  const save = button(page, 'Save as new version')
  await expect(save).toBeDisabled()
  await button(page, `Use ${a.semver}’s text`).last().click()
  await expect(save).toBeEnabled()
  const response = page.waitForResponse(
    (r) => r.url().includes('/save-as-new') && r.request().method() === 'POST',
  )
  await save.click()
  const res = await response
  expect(res.status()).toBe(200)
  const saved = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: ((await res.json()) as { id: number }).id,
    depth: 0,
  })
  expect(saved.sourceVersion).toBe(a.id)
  expect(saved.mergedFrom).toBe(b.id)
  expect(saved.lessons?.[0].overview).toBe('Second text')
  expect(saved.lessons?.[0].teacherReflection).toBe('First reflection')
})
