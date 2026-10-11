/** PR 4b: real browser controls over the already wire-tested moderation and settings endpoints. */
import { expect, test } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { clearPostingCaps, createTopicAs, testSubmissionKey } from '../helpers/discussions'
import { MARK, setForumEnabled, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

test.describe('Discussion administration', () => {
  test('a navigation from an already-open thread observes the off switch', async ({ page }) => {
    const topic = await createTopicAs(fx.payload, fx.users.teacher)
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/discuss/${topic.id}`)
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Discuss/ }),
    ).toBeVisible()
    await setForumEnabled(fx.payload, false)
    await page.getByRole('link', { name: 'Back to discussions' }).click()
    await expect(page.getByRole('link', { name: 'Start a discussion' })).toHaveCount(0)
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Discuss/ }),
    ).toHaveCount(0)
  })
  test('a soft Back from a lesson refreshes the forum switch in the shared navigation', async ({
    page,
  }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}`)
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Discuss/ }),
    ).toBeVisible()
    await setForumEnabled(fx.payload, false)
    await page.getByRole('link', { name: 'Back to lesson plans' }).click()
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Discuss/ }),
    ).toHaveCount(0)
  })
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
    await setForumEnabled(fx.payload, true)
  })

  test.afterEach(async () => {
    await setForumEnabled(fx.payload, true)
  })
  test.afterAll(async () => {
    if (fx) await clearPostingCaps(fx.payload, Object.values(fx.users))
    await fx?.teardown()
  })

  test('pin and unpin require confirmation and update the pinned block', async ({ page }) => {
    const title = `${MARK}Pin controls`
    const topic = await createTopicAs(fx.payload, fx.users.teacher, { title })
    await loginAs(page, fx, 'siteAdmin')
    await page.goto(`${BASE}/discuss/${topic.id}`)
    await page.getByRole('button', { name: 'Pin', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Pin', exact: true })
      .getByRole('button', { name: 'Cancel' })
      .click()
    expect(
      (await fx.payload.findByID({ collection: 'discussion-topics', id: topic.id })).pinnedAt,
    ).toBeFalsy()
    await page.getByRole('button', { name: 'Pin', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Pin', exact: true })
      .getByRole('button', { name: 'Pin', exact: true })
      .click()
    await expect(page.getByRole('button', { name: 'Unpin', exact: true })).toBeVisible()
    await page.goto(`${BASE}/discuss`)
    await expect(
      page.getByRole('region', { name: 'Pinned', exact: true }).getByRole('link', { name: title }),
    ).toBeVisible()
    await page.getByRole('link', { name: title }).click()
    await page.getByRole('button', { name: 'Unpin', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Unpin', exact: true })
      .getByRole('button', { name: 'Unpin', exact: true })
      .click()
    await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeVisible()
    await page.goto(`${BASE}/discuss`)
    await expect(
      page.getByRole('region', { name: 'Latest activity' }).getByRole('link', { name: title }),
    ).toBeVisible()
  })

  test('redact title, opening post and reply separately; delete the entire thread', async ({
    page,
  }, testInfo) => {
    const title = `${MARK}Redaction controls`
    const topic = await createTopicAs(fx.payload, fx.users.teacher, {
      title,
      body: 'Opening text to remove',
    })
    const reply = await fx.payload.create({
      collection: 'discussion-replies',
      data: {
        topic: topic.id,
        body: 'Reply text to remove',
        joinedAtSeq: 0,
        submissionKey: testSubmissionKey(),
      } as never,
      overrideAccess: false,
      user: fx.users.teacher,
    })
    await loginAs(page, fx, 'siteAdmin')
    await page.goto(`${BASE}/discuss/${topic.id}`)
    await page.getByRole('button', { name: 'Redact topic' }).click()
    const dialog = page.getByRole('dialog', { name: 'Redact', exact: true })
    await expect(dialog).toContainText('Existing backups keep the text until they age out.')
    await page.screenshot({ path: testInfo.outputPath('redaction-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath('redaction-mobile.png') })
    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(dialog.getByRole('button', { name: 'Redact', exact: true })).toBeDisabled()
    await dialog.getByLabel('Title', { exact: true }).check()
    await dialog.getByRole('button', { name: 'Redact', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Title removed by the administrator' }),
    ).toBeVisible()
    await expect(page.getByText('Opening text to remove', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Redact topic' }).click()
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveCount(0)
    await dialog.getByLabel('Opening post').check()
    await dialog.getByRole('button', { name: 'Redact', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Opening post', exact: true })).toContainText(
      'Removed by the administrator',
    )
    await expect(page.getByRole('button', { name: 'Redact topic' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Redact reply' }).click()
    await dialog.getByRole('button', { name: 'Redact', exact: true }).click()
    await expect(page.locator('#reply-1')).toContainText('Removed by the administrator')
    expect(
      (await fx.payload.findByID({ collection: 'discussion-replies', id: reply.id })).body,
    ).toBe('')
    await page.getByRole('button', { name: 'Delete thread' }).click()
    const deletion = page.getByRole('dialog', { name: 'Delete thread', exact: true })
    await expect(deletion).toContainText('This cannot be undone.')
    await deletion.getByRole('button', { name: 'Cancel' }).click()
    expect(
      await fx.payload.count({
        collection: 'discussion-topics',
        where: { id: { equals: topic.id } },
      }),
    ).toMatchObject({ totalDocs: 1 })
    await page.getByRole('button', { name: 'Delete thread' }).click()
    await deletion.getByRole('button', { name: 'Delete thread', exact: true }).click()
    await page.waitForURL(`${BASE}/discuss`)
    expect(
      await fx.payload.count({
        collection: 'discussion-replies',
        where: { topic: { equals: topic.id } },
      }),
    ).toMatchObject({ totalDocs: 0 })
    expect((await page.goto(`${BASE}/discuss/${topic.id}`))?.status()).toBe(404)
  })

  test('teachers and subject administrators see no moderation or System Features controls', async ({
    page,
  }) => {
    const topic = await createTopicAs(fx.payload, fx.users.teacher)
    for (const role of ['teacher', 'subjectAdmin'] as const) {
      await page.context().clearCookies()
      await loginAs(page, fx, role)
      await page.goto(`${BASE}/discuss/${topic.id}`)
      await expect(page.getByRole('button', { name: 'Delete thread' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Redact|^Pin$/ })).toHaveCount(0)
      if (role === 'subjectAdmin') {
        await page.goto(`${BASE}/admin?open=system,system.features`)
        await expect(page.getByLabel('Discussions enabled')).toHaveCount(0)
      }
    }
  })

  test('a pending switch writes only after password Save; while off only administrator moderation remains', async ({
    page,
    browser,
  }, testInfo) => {
    const topic = await createTopicAs(fx.payload, fx.users.teacher, {
      title: `${MARK}Off moderation`,
    })
    const teacher = await browser.newPage()
    try {
      await loginAs(teacher, fx, 'teacher')
      await loginAs(page, fx, 'siteAdmin')
      await page.goto(`${BASE}/admin?open=system,system.features`)
      const toggle = page.getByLabel('Discussions enabled')
      await toggle.uncheck()
      expect(
        (await fx.payload.findGlobal({ slug: 'system-settings' })).features?.forumEnabled,
      ).toBe(true)
      await expect(page.getByText('Unsaved change: switch Discussions off.')).toBeVisible()
      // Scope Save to Features: other Manage panels have their own Save controls.
      await page
        .locator('.lp-system-features')
        .getByRole('button', { name: 'Save', exact: true })
        .click()
      const save = page.getByRole('dialog', { name: 'Save settings', exact: true })
      await page.screenshot({ path: testInfo.outputPath('system-save-desktop.png') })
      await save.getByLabel('Your password').fill('not-the-password')
      await save.getByRole('button', { name: 'Save settings', exact: true }).click()
      await expect(save.getByRole('alert')).toContainText('password')
      expect(
        (await fx.payload.findGlobal({ slug: 'system-settings' })).features?.forumEnabled,
      ).toBe(true)
      await save.getByLabel('Your password').fill(fx.password)
      await save.getByRole('button', { name: 'Save settings', exact: true }).click()
      await expect(save).toHaveCount(0)
      await expect(toggle).not.toBeChecked()
      await expect(
        page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Discuss/ }),
      ).toHaveCount(0)
      await page.reload()
      await expect(toggle).not.toBeChecked()
      await page.getByRole('link', { name: 'Moderate discussions' }).click()
      await expect(page.getByText('Discussions are switched off.', { exact: false })).toBeVisible()
      await expect(page.getByRole('search')).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Start a discussion' })).toHaveCount(0)
      await page.getByRole('link', { name: `${MARK}Off moderation` }).click()
      await expect(page.getByRole('button', { name: 'Pin', exact: true })).toHaveCount(0)
      await expect(page.getByLabel('Reply', { exact: true })).toHaveCount(0)
      await expect(
        page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Discuss/ }),
      ).toHaveCount(0)
      await page.getByRole('button', { name: 'Redact topic' }).click()
      await page.getByRole('dialog').getByLabel('Opening post').check()
      await page.getByRole('dialog').getByRole('button', { name: 'Redact', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Opening post', exact: true })).toContainText(
        'Removed by the administrator',
      )
      await page.getByRole('button', { name: 'Delete thread' }).click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Delete thread', exact: true })
        .click()
      await page.waitForURL(`${BASE}/discuss`)
      expect(
        await fx.payload.count({
          collection: 'discussion-topics',
          where: { id: { equals: topic.id } },
        }),
      ).toMatchObject({ totalDocs: 0 })
      expect((await page.goto(`${BASE}/discuss/new`))?.status()).toBe(404)
      expect((await teacher.goto(`${BASE}/discuss`))?.status()).toBe(404)
      expect((await teacher.goto(`${BASE}/discuss/new`))?.status()).toBe(404)
      await page.goto(`${BASE}/admin?open=system,system.features`)
      await toggle.check()
      await page
        .locator('.lp-system-features')
        .getByRole('button', { name: 'Save', exact: true })
        .click()
      await save.getByLabel('Your password').fill(fx.password)
      await save.getByRole('button', { name: 'Save settings', exact: true }).click()
      await expect(save).toHaveCount(0)
      await teacher.goto(`${BASE}/discuss`)
      await expect(teacher.getByRole('link', { name: 'Start a discussion' })).toBeVisible()
    } finally {
      await teacher.close()
    }
  })

  test('a stale System page requires reload and never overwrites another administrator’s Save', async ({
    page,
  }) => {
    await loginAs(page, fx, 'siteAdmin')
    await page.goto(`${BASE}/admin?open=system,system.features`)
    await page.getByLabel('Discussions enabled').uncheck()
    await setForumEnabled(fx.payload, false)
    await page
      .locator('.lp-system-features')
      .getByRole('button', { name: 'Save', exact: true })
      .click()
    await page.getByRole('dialog').getByLabel('Your password').fill(fx.password)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save settings', exact: true })
      .click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed')
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Reload settings' }),
    ).toBeVisible()
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Save settings', exact: true }),
    ).toHaveCount(0)
  })
})
