import { test, expect } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

test.describe('Messages compose and reply', () => {
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
  })
  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('labelled fields send a message, and its recipient can reply from the inbox', async ({
    browser,
  }) => {
    const sender = await browser.newPage()
    const recipient = await browser.newPage()
    try {
      await loginAs(sender, fx, 'teacher')
      await sender.goto(`${BASE}/messages`)
      await expect(sender.getByRole('heading', { name: 'Messages', exact: true })).toBeVisible()
      await sender.getByRole('button', { name: 'New message' }).click()
      const to = sender.getByRole('combobox', { name: 'To', exact: true })
      await expect(to).toHaveAccessibleDescription(
        'Anyone with a repository account — everyone is listed by name.',
      )
      await to.selectOption(String(fx.users.editor.id))
      await sender.getByRole('textbox', { name: 'Message', exact: true }).fill(`${MARK}New note`)
      await sender.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(sender.getByRole('status')).toHaveText('Message sent.')
      await expect(sender.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('')
      await sender.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(sender.getByRole('button', { name: 'New message' })).toBeVisible()

      await loginAs(recipient, fx, 'editor')
      await recipient.goto(`${BASE}/messages`)
      const received = recipient.locator('.msg', { hasText: `${MARK}New note` })
      await expect(received).toBeVisible()
      await received.getByRole('button', { name: 'Reply', exact: true }).click()
      await received.locator('textarea').fill(`${MARK}Reply note`)
      await received.getByRole('button', { name: 'Send reply', exact: true }).click()
      await expect(received.locator('textarea')).toHaveCount(0)
      await sender.goto(`${BASE}/messages`)
      await expect(sender.locator('.msg', { hasText: `${MARK}Reply note` })).toBeVisible()
    } finally {
      await Promise.all([sender.close(), recipient.close()])
    }
  })
})
