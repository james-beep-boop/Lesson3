import { test, expect } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

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

  test('whole-lesson links stay live; deleted-version messages and their replies retain unavailable labels', async ({
    browser,
  }) => {
    const content = minimalBundleContent()
    const saved = await fx.payload.create({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.1',
        title: `${MARK}Saved`,
        sourceVersion: fx.version.id,
        ...content,
        meta: { ...content.meta, substrand_name: 'Shared lesson reference' },
      } as never,
    })
    const sender = await browser.newPage()
    const recipient = await browser.newPage()
    try {
      await loginAs(sender, fx, 'teacher')
      await sender.goto(`${BASE}/messages?plan=${fx.plan.id}&version=${saved.id}`)
      await expect(sender.getByText('Shared lesson reference · v1.0.1')).toBeVisible()
      await sender
        .getByRole('combobox', { name: 'To', exact: true })
        .selectOption(String(fx.users.editor.id))
      await sender
        .getByRole('textbox', { name: 'Message', exact: true })
        .fill(`${MARK}Version note`)
      await sender.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(sender.getByRole('status')).toHaveText('Message sent.')
      const versionCard = sender.locator('.msg', { hasText: `${MARK}Version note` })
      await expect(versionCard.getByRole('link', { name: 'Compare changes' })).toHaveAttribute(
        'href',
        `/lessons/${fx.plan.id}/compare?from=${fx.version.id}&to=${saved.id}`,
      )
      await fx.payload.create({
        collection: 'messages',
        overrideAccess: true,
        data: {
          sender: fx.users.teacher.id,
          recipient: fx.users.editor.id,
          body: `${MARK}Whole lesson note`,
          lessonPlan: fx.plan.id,
        },
      })
      await fx.payload.delete({
        collection: 'lesson-bundle-versions',
        id: saved.id,
        overrideAccess: true,
      })

      await loginAs(recipient, fx, 'editor')
      await recipient.goto(`${BASE}/messages`)
      const whole = recipient.locator('.msg', { hasText: `${MARK}Whole lesson note` })
      await expect(whole.locator('.msg-link a')).toHaveAttribute('href', `/lessons/${fx.plan.id}`)
      await expect(whole).not.toContainText('this version is no longer available')
      const deleted = recipient.locator('.msg', { hasText: `${MARK}Version note` })
      await expect(deleted).toContainText('Shared lesson reference · v1.0.1')
      await expect(deleted).toContainText('this version is no longer available')
      await expect(deleted.locator('.msg-link a')).toHaveCount(0)
      await deleted.getByRole('button', { name: 'Reply', exact: true }).click()
      await deleted.locator('textarea').fill(`${MARK}Deleted version reply`)
      await deleted.getByRole('button', { name: 'Send reply', exact: true }).click()
      await expect(deleted.locator('textarea')).toHaveCount(0)
      await sender.goto(`${BASE}/messages`)
      const reply = sender.locator('.msg', { hasText: `${MARK}Deleted version reply` })
      await expect(reply).toContainText('Shared lesson reference · v1.0.1')
      await expect(reply).toContainText('this version is no longer available')
      await expect(reply.locator('.msg-link a')).toHaveCount(0)
    } finally {
      await Promise.all([sender.close(), recipient.close()])
    }
  })

  test('an unavailable explicitly requested version is explained instead of becoming a whole-lesson reference', async ({
    page,
  }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/messages?plan=${fx.plan.id}&version=999999999`)
    await expect(
      page.getByText('The lesson version you came from is no longer available'),
    ).toBeVisible()
    await expect(page.locator('.msg-compose__about')).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'To', exact: true })).toBeVisible()
  })
})
