import { test, expect } from '@playwright/test'
import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import {
  minimalBundleContent,
  setupRoleFixture,
  setAdvancedTools,
  type RoleFixture,
} from '../helpers/fixtures'
import { drizzleOf } from '../helpers/db'
import { withReleaseFingerprint } from '../../src/ingest/releaseFingerprintContext'

let fx: RoleFixture
let firstId: number
let ownId: number
let officialId: number

test.beforeAll(async () => {
  fx = await setupRoleFixture()
  const create = (
    semver: string,
    sourceVersion: number,
    author?: number,
    purpose = 'Original purpose',
  ) => {
    const content = minimalBundleContent()
    content.lessons[0].slo!.purpose = purpose
    return {
      ...content,
      title: fx.version.title,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      sourceVersion,
      author,
    }
  }
  const req = { payload: fx.payload, context: {} } as PayloadRequest
  const first = await withReleaseFingerprint(req, 'test-first-release', () =>
    fx.payload.create({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      req,
      data: create('2.0.0', fx.version.id) as never,
    }),
  )
  firstId = first.id
  ownId = (
    await fx.payload.create({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      data: create('2.0.1', firstId, fx.users.editor.id, 'Teacher purpose') as never,
    })
  ).id
  officialId = (
    await withReleaseFingerprint(
      req,
      'test-new-release',
      () =>
        fx.payload.create({
          collection: 'lesson-bundle-versions',
          overrideAccess: true,
          req,
          // The source is deliberately different from the true previous Official below.
          data: create('3.0.0', fx.version.id, undefined, 'New ARES purpose') as never,
        }),
      { id: 'November', date: '2026-11-14' },
    )
  ).id
  await fx.payload.update({
    collection: 'lesson-plans',
    id: fx.plan.id,
    data: { officialVersion: officialId },
    overrideAccess: true,
  })
  // Controlled audit fixture: creation dates are today, the real Official move is 3 December.
  await drizzleOf(fx.payload).execute(
    sql`UPDATE lesson_plans SET official_changed_at = '2026-12-03T15:00:00Z', official_changed_from_id = ${firstId}, official_changed_by_id = NULL WHERE id = ${fx.plan.id}`,
  )
})
test.afterAll(async () => {
  if (fx) await setAdvancedTools(fx.payload, false)
  await fx?.teardown()
})

test('release dates appear in headers, version lists and details without overflowing a phone', async ({
  page,
}, testInfo) => {
  await setAdvancedTools(fx.payload, false)
  await loginAs(page, fx, 'editor')
  await page.goto(`${BASE}/lessons/${fx.plan.id}`)
  await expect(page.locator('.lesson-context')).toContainText('3.0.0 · ARES release 14 Nov 2026')
  await expect(page.getByRole('note')).toHaveText(
    'Official updated to the ARES release of 14 Nov 2026 on 03 Dec 2026. The previous Official (2.0.0) is still in the version history.',
  )
  await page.locator('.lesson-details summary').click()
  await expect(page.locator('.lesson-details dl')).toContainText('3.0.0 · ARES release 14 Nov 2026')
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 })
    await page.getByRole('button', { name: '4 versions ▾', exact: true }).click()
    const panel = page.getByRole('dialog')
    await expect(panel).toContainText('3.0.0 · ARES release 14 Nov 2026')
    await expect(panel).toContainText('2.0.0 · ARES release: not stated')
    await expect(panel.locator('.vp-line').filter({ hasText: '2.0.1' })).not.toContainText(
      'ARES release',
    )
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`release-list-${width}.png`),
      fullPage: true,
    })
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
  }
  await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${firstId}`)
  await expect(page.locator('.lesson-context')).toContainText('2.0.0 · ARES release: not stated')
  await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${ownId}`)
  await expect(page.locator('.lesson-context')).not.toContainText('ARES release')
  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${officialId}`)
  await expect(page.locator('.version-timestamps')).toContainText('ARES release 14 Nov 2026')
})

test('only Advanced offers the teacher’s own version, dismissal resets on reload and Combine opens', async ({
  page,
}) => {
  await setAdvancedTools(fx.payload, false)
  await loginAs(page, fx, 'editor')
  await page.goto(`${BASE}/lessons/${fx.plan.id}`)
  const prompt = page.getByRole('complementary', { name: 'Newer ARES release' })
  await expect(prompt).toHaveCount(0)
  await setAdvancedTools(fx.payload, true)
  await page.reload()
  await expect(prompt).toContainText('Your version 2.0.1 is based on the older one.')
  const before = await fx.payload.count({ collection: 'lesson-bundle-versions' })
  await prompt.getByRole('button', { name: 'Not now' }).click()
  await expect(prompt).toHaveCount(0)
  await page.reload()
  await expect(prompt).toBeVisible()
  // Below the editing width it explains itself instead of opening the editor, as Edit does.
  await page.setViewportSize({ width: 390, height: 850 })
  await prompt.getByRole('button', { name: 'Combine them?' }).click()
  await expect(page.getByRole('dialog')).toContainText('wider screen')
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.setViewportSize({ width: 1280, height: 850 })
  await prompt.getByRole('button', { name: 'Combine them?' }).click()
  await expect(page).toHaveURL(new RegExp(`/${ownId}\\?combineWith=${officialId}$`))
  await expect(page.getByRole('button', { name: 'Continue in editor', exact: true })).toBeVisible()
  expect(await fx.payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)
})

test('a reader without editing access sees the notice and no Combine suggestion even in Advanced', async ({
  page,
}) => {
  await setAdvancedTools(fx.payload, true)
  await loginAs(page, fx, 'teacher')
  await page.goto(`${BASE}/lessons/${fx.plan.id}`)
  await expect(page.getByRole('note')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Combine them?' })).toHaveCount(0)
})

test('legacy unstamped plans and human Official changes have no import notice', async ({
  page,
}) => {
  await loginAs(page, fx, 'teacher')
  await drizzleOf(fx.payload).execute(
    sql`UPDATE lesson_plans SET official_changed_at = NULL WHERE id = ${fx.plan.id}`,
  )
  await page.goto(`${BASE}/lessons/${fx.plan.id}`)
  await expect(page.getByRole('note')).toHaveCount(0)
  await drizzleOf(fx.payload).execute(
    sql`UPDATE lesson_plans SET official_changed_at = '2026-12-03T15:00:00Z', official_changed_by_id = ${fx.users.subjectAdmin.id} WHERE id = ${fx.plan.id}`,
  )
  await page.reload()
  await expect(page.getByRole('note')).toHaveCount(0)
})
