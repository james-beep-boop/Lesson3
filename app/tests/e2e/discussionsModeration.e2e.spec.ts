/** PR 4b: real browser controls over the already wire-tested moderation and settings endpoints. */
import { expect, test, type Page } from '@playwright/test'
import { sql } from '@payloadcms/db-postgres'

import { drizzleOf } from '../helpers/db'
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
  // ⚑ REAL history traversal (review of #380, GPT 2026-10-11). The tests above click links named "Back";
  // these press the browser's Back, which restores the PAGE from Next's client cache. That is the case a
  // nav summary cannot see, so `NavigationFreshness` must always refresh on it.
  test('browser Back to a lesson after switch-off shows no forum entry points', async ({
    page,
  }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}`)
    await page.getByRole('link', { name: 'Back to lesson plans' }).click()
    await page.waitForURL(`${BASE}/`)
    await setForumEnabled(fx.payload, false)
    await page.goBack()
    await page.waitForURL(new RegExp(`/lessons/${fx.plan.id}$`))
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Discuss/ }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: /^Share/ }).click()
    await expect(page.getByRole('link', { name: 'Message a colleague' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Discuss this version' })).toHaveCount(0)
  })

  /** What the nav check would answer for this page's user right now. */
  const navState = async (page: Page) =>
    (await page.request.get(`${BASE}/api/discussion-topics/nav-state`)).json()

  // ⚑ GPT review 2026-10-11: isolate the case a nav summary CANNOT see. A redaction changes neither of
  // the two booleans, so only "Back/Forward always refreshes" can show it; a reply by someone else would
  // also flip `unread` and let a refresh-only-on-change check pass by accident.
  test('browser Back to a thread shows a redaction made meanwhile, with the nav state unchanged', async ({
    page,
  }) => {
    const secret = `${MARK}Phone 0700 000 000`
    const topic = await createTopicAs(fx.payload, fx.users.teacher, { body: secret })
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/discuss/${topic.id}`)
    await expect(page.getByText(secret)).toBeVisible()
    await page.getByRole('link', { name: 'Back to discussions' }).click()
    await page.waitForURL(`${BASE}/discuss`)

    const before = await navState(page)
    await drizzleOf(fx.payload).execute(
      sql`UPDATE discussion_topics SET body = '', redacted_at = now() WHERE id = ${topic.id}`,
    )
    expect(await navState(page), 'the redaction must not change what the nav check sees').toEqual(
      before,
    )

    await page.goBack()
    await page.waitForURL(new RegExp(`/discuss/${topic.id}`))
    await expect(page.getByText('Removed by the administrator')).toBeVisible()
    await expect(page.getByText(secret)).toHaveCount(0)
  })

  test('browser Back to a thread shows a reply made meanwhile', async ({ page }) => {
    const topic = await createTopicAs(fx.payload, fx.users.teacher)
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/discuss/${topic.id}`)
    await page.getByRole('link', { name: 'Back to discussions' }).click()
    await page.waitForURL(`${BASE}/discuss`)
    await fx.payload.create({
      collection: 'discussion-replies',
      data: {
        topic: topic.id,
        body: `${MARK}A reply made while you were away`,
        submissionKey: testSubmissionKey(),
        joinedAtSeq: 0,
      } as never,
      overrideAccess: false,
      user: fx.users.editor,
    })
    await page.goBack()
    await page.waitForURL(new RegExp(`/discuss/${topic.id}`))
    await expect(page.getByText(`${MARK}A reply made while you were away`)).toBeVisible()
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
    const pinDialog = page.getByRole('dialog', { name: 'Pin this discussion', exact: true })
    // The title is the whole question (operator decision 2026-10-22): no body paragraph.
    await expect(pinDialog.locator('.modal__body')).toHaveCount(0)
    await pinDialog.getByRole('button', { name: 'Cancel' }).click()
    expect(
      (await fx.payload.findByID({ collection: 'discussion-topics', id: topic.id })).pinnedAt,
    ).toBeFalsy()
    await page.getByRole('button', { name: 'Pin', exact: true }).click()
    await pinDialog.getByRole('button', { name: 'Pin', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Unpin', exact: true })).toBeVisible()
    await page.goto(`${BASE}/discuss`)
    await expect(
      page.getByRole('region', { name: 'Pinned', exact: true }).getByRole('link', { name: title }),
    ).toBeVisible()
    await page.getByRole('link', { name: title }).click()
    await page.getByRole('button', { name: 'Unpin', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Unpin this discussion', exact: true })
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
    // Trigger buttons are scoped to their moderation group: the dialog's confirm button is also
    // called "Redact".
    const threadModeration = page.getByRole('group', { name: 'Thread moderation' })
    // Order Pin · Delete thread · Redact (operator decision 2026-10-22).
    await expect(threadModeration.getByRole('button')).toHaveText([
      'Pin',
      'Delete thread',
      'Redact',
    ])
    await threadModeration.getByRole('button', { name: 'Redact', exact: true }).click()
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
    await threadModeration.getByRole('button', { name: 'Redact', exact: true }).click()
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveCount(0)
    await dialog.getByLabel('Opening post').check()
    await dialog.getByRole('button', { name: 'Redact', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Opening post', exact: true })).toContainText(
      'Removed by the administrator',
    )
    await expect(threadModeration.getByRole('button', { name: 'Redact' })).toHaveCount(0)
    await page
      .getByRole('group', { name: 'Reply moderation' })
      .getByRole('button', { name: 'Redact', exact: true })
      .click()
    await dialog.getByRole('button', { name: 'Redact', exact: true }).click()
    await expect(page.locator('#reply-1')).toContainText('Removed by the administrator')
    expect(
      (await fx.payload.findByID({ collection: 'discussion-replies', id: reply.id })).body,
    ).toBe('')
    await page.getByRole('button', { name: 'Delete thread' }).click()
    const deletion = page.getByRole('dialog', {
      name: 'Delete entire thread and all replies',
      exact: true,
    })
    await expect(deletion).toContainText('This cannot be undone.')
    // Two equal buttons, Cancel first (operator decision 2026-10-22).
    const [cancelBox, deleteBox] = await Promise.all(
      ['Cancel', 'Delete'].map((name) =>
        deletion.getByRole('button', { name, exact: true }).boundingBox(),
      ),
    )
    expect(cancelBox!.x).toBeLessThan(deleteBox!.x)
    expect(Math.abs(cancelBox!.width - deleteBox!.width)).toBeLessThan(1)
    await page.screenshot({ path: testInfo.outputPath('delete-thread-desktop.png') })
    await page.setViewportSize({ width: 360, height: 780 })
    await page.screenshot({ path: testInfo.outputPath('delete-thread-mobile.png') })
    await page.setViewportSize({ width: 1280, height: 720 })
    await deletion.getByRole('button', { name: 'Cancel' }).click()
    expect(
      await fx.payload.count({
        collection: 'discussion-topics',
        where: { id: { equals: topic.id } },
      }),
    ).toMatchObject({ totalDocs: 1 })
    await page.getByRole('button', { name: 'Delete thread' }).click()
    await deletion.getByRole('button', { name: 'Delete', exact: true }).click()
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
      await page
        .getByRole('group', { name: 'Thread moderation' })
        .getByRole('button', { name: 'Redact', exact: true })
        .click()
      await page.getByRole('dialog').getByLabel('Opening post').check()
      await page.getByRole('dialog').getByRole('button', { name: 'Redact', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Opening post', exact: true })).toContainText(
        'Removed by the administrator',
      )
      await page.getByRole('button', { name: 'Delete thread' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
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
