/**
 * Signing up on a site that cannot send email (an offline school server), end to end (2026-10-19).
 *
 * No verification link can ever arrive there, so the journey is: the sign-up form says before and
 * after that a Site Administrator approves the account → signing in early says "waiting for
 * approval", never "check your email" → the administrator sees a notice on Manage, follows it to the
 * filtered Accounts list and approves → the teacher can sign in.
 *
 * The browser stack runs without SMTP, so this is the stack's own shape; with SMTP the wording
 * differs by design and this spec does not apply.
 */
import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { clearRateLimitBuckets } from '../helpers/db'
import { deleteUserFixture, MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

test.skip(!!process.env.SMTP_HOST?.trim(), 'applies only to a site without email')

let fx: RoleFixture
const email = `${MARK.toLowerCase()}${randomUUID()}_offline-signup@example.com`
const password = 'offline-signup-1234'

test.beforeAll(async () => {
  fx = await setupRoleFixture()
})

test.afterAll(async () => {
  // Setup may have failed before `fx` was assigned; and the signed-up account's removal must not be
  // able to skip the fixture's own teardown (#415 review).
  if (!fx) return
  try {
    const { docs } = await fx.payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      overrideAccess: true,
      depth: 0,
    })
    for (const user of docs) await deleteUserFixture(fx.payload, user.id)
  } finally {
    await fx.teardown()
  }
})

const signIn = async (page: Page) => {
  await clearRateLimitBuckets(fx.payload, `login:${email}`)
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a teacher signs up without email, waits for approval, and signs in once approved', async ({
  page,
  browser,
}) => {
  // 1. Sign up: approval is explained before and after, and no email is promised.
  await page.goto(`${BASE}/signup`)
  await expect(page.getByText('This site does not send email.', { exact: false })).toBeVisible()
  await page.getByLabel('Display name').fill(`${MARK}Offline teacher`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  const done = page.getByRole('status')
  await expect(done).toContainText('needs to approve it')
  await expect(done).not.toContainText('emailed')

  // 2. Signing in before approval names the administrator, not a mailbox.
  await signIn(page)
  // The form's own error, not `getByRole('alert')`: Next.js's route announcer is also an alert.
  const refused = page.locator('.form-error')
  await expect(refused).toContainText('waiting for approval')
  await expect(refused).not.toContainText('email')

  // 3. The Site Administrator is told, follows the notice to the queue, and approves.
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  try {
    await loginAs(admin, fx, 'siteAdmin')
    await admin.goto(`${BASE}/admin`)
    await expect(admin.getByRole('heading', { name: /waiting for your approval/ })).toBeVisible()
    await admin.getByRole('link', { name: 'Review them in Accounts' }).click()
    await expect(admin.getByLabel('Filter users by status')).toHaveValue('awaiting')
    const row = admin.locator('.lp-users .lp-users__row').filter({ hasText: email })
    await expect(row).toBeVisible()
    await row.locator('.lp-users__summary').click()
    await expect(row.locator('.lp-users__summary-meta')).toContainText('Awaiting approval')
    await row.getByRole('button', { name: 'Approve', exact: true }).click()
    // Approved accounts leave the queue.
    await expect(admin.locator('.lp-users .lp-users__row').filter({ hasText: email })).toHaveCount(
      0,
    )
  } finally {
    await adminContext.close()
  }

  // 4. Now the teacher can sign in.
  await signIn(page)
  await expect(page).not.toHaveURL(/\/login/)
})
