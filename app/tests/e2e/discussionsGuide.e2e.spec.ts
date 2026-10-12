/** PR 4c: the Guide uses the same fresh switch reading as the forum and navigation. */
import { expect, test } from '@playwright/test'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { setForumEnabled, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  await setForumEnabled(fx.payload, true)
})
test.afterAll(async () => {
  if (fx) await setForumEnabled(fx.payload, true)
  await fx?.teardown()
})

test('forum Guide tasks follow the switch; administrator moderation instructions stay available', async ({
  page,
}) => {
  await page.goto(`${BASE}/login`)
  const version = await page.locator('.app-version').innerText()
  await test.info().attach('login-version', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  expect(version).toMatch(
    /^(Version \d+\.\d+(?:\.\d+)?|Build [a-f0-9]+|Development build|Version unavailable)$/,
  )
  await loginAs(page, fx, 'editor')
  await page.goto(`${BASE}/guide?open=teachers,editing`)
  await expect(page.locator('.guide-footer .app-version')).toHaveText(version)
  await page.locator('.guide-footer').scrollIntoViewIfNeeded()
  await test.info().attach('guide-version', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await expect(page.getByRole('button', { name: 'Start a discussion and reply' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a lesson reference' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discuss your saved changes' })).toBeVisible()
  await setForumEnabled(fx.payload, false)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start a discussion and reply' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add a lesson reference' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Discuss your saved changes' })).toHaveCount(0)
  await page.context().clearCookies()
  await loginAs(page, fx, 'siteAdmin')
  await page.goto(`${BASE}/guide?at=site-admins.discussions`)
  await expect(page.getByRole('button', { name: 'Switch and moderate Discussions' })).toBeVisible()
  await expect(
    page.getByText('Existing backups keep the text until they age out.', { exact: false }),
  ).toBeVisible()
})
