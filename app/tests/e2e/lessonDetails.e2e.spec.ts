import { test, expect } from '@playwright/test'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import {
  minimalBundleContent,
  setupRoleFixture,
  setAdvancedTools,
  type RoleFixture,
} from '../helpers/fixtures'

let fx: RoleFixture
let versionId: number
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  await setAdvancedTools(fx.payload, false)
  const version = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    overrideAccess: true,
    data: {
      ...minimalBundleContent(),
      title: fx.version.title,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.0.1',
      author: fx.users.editor.id,
      sourceVersion: fx.version.id,
    } as never,
  })
  versionId = version.id
})
test.afterAll(async () => {
  await fx?.teardown()
})

for (const role of ['teacher', 'editor'] as const) {
  test(`${role === 'teacher' ? 'Teacher' : 'Teacher with editing access'} can inspect the selected version in Standard mode`, async ({
    page,
  }) => {
    await loginAs(page, fx, role)
    await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${versionId}`)
    const disclosure = page.locator('.lesson-details')
    const toggle = disclosure.locator('summary')
    const fields = disclosure.locator('dl')
    await expect(disclosure).not.toHaveAttribute('open')
    await expect(fields).toBeHidden()

    // Keyboard and pointer activation, including a phone viewport. Inspection stays on this page.
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await toggle.focus()
      await toggle.press('Enter')
      await expect(toggle).toHaveAccessibleName('Hide details')
      await expect(disclosure.locator('.lesson-details__hide')).toBeVisible()
      await expect(fields).toContainText(fx.users.editor.name)
      await expect(fields).toContainText(fx.version.semver)
      await expect(fields.locator('time')).toHaveCount(2)
      await expect(fields).not.toContainText(fx.users.editor.email)
      await expect(page).toHaveURL(`${BASE}/lessons/${fx.plan.id}?version=${versionId}`)
      expect(await fields.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(
        width,
      )
      await toggle.click()
      await expect(fields).toBeHidden()
    }

    // Following another version starts closed and displays that version's own provenance.
    await page.goto(`${BASE}/lessons/${fx.plan.id}`)
    await expect(disclosure).not.toHaveAttribute('open')
    await toggle.click()
    await expect(fields).toContainText('Not recorded')
    await expect(fields).not.toContainText(fx.users.editor.name)
  })
}
