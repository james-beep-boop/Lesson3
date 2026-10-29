/**
 * Discussions 4a in a real browser (`docs/DESIGN-discussions-2026-10-09.md` §16.5, 4a contract): the
 * Discussions page, the composers, the reference picker, the nav dot and both entry points, and the
 * off switch.
 *
 * ⚑ THE LOAD-BEARING CASES:
 *   - the dot lights for another's reply and clears once the thread page has been READ (the mark-read
 *     POST after render), never during the GET;
 *   - a reply that LANDED although its answer was lost — on page 2 of a long thread — is recovered by
 *     key and shown on its own page, not posted twice (GPT review 2026-10-10);
 *   - while the forum is off there is no page, no nav item and no entry point.
 *
 * Runs exactly like `catalogue.e2e.spec.ts` — see `manage.e2e.spec.ts`'s header.
 */
import { test, expect, type Page } from '@playwright/test'
import { sql } from '@payloadcms/db-postgres'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { drizzleOf, rowsOf } from '../helpers/db'
import { clearPostingCaps } from '../helpers/discussions'
import {
  MARK,
  minimalBundleContent,
  setForumEnabled,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures'
import type { LessonBundleVersion } from '../../src/payload-types'

let fx: RoleFixture
/** A saved version authored by the Teacher with editing access, based on the Official one. */
let saved: LessonBundleVersion

const primaryNav = (page: Page) => page.getByRole('navigation', { name: 'Primary' })

async function startDiscussion(page: Page, title: string, body: string) {
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Post', { exact: true }).fill(body)
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await page.waitForURL(/\/discuss\/\d+$/)
}

test.describe('Discussions', () => {
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
    await setForumEnabled(fx.payload, true)
    saved = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.1',
        title: `${MARK}Plan v1.0.1`,
        sourceVersion: fx.version.id,
        author: fx.users.editor.id,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as LessonBundleVersion
  })

  test.afterAll(async () => {
    if (fx) {
      await setForumEnabled(fx.payload, true)
      await clearPostingCaps(fx.payload, Object.values(fx.users))
    }
    await fx?.teardown()
  })

  test('Discuss this version starts a discussion that references the version', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${saved.id}`)
    await page.getByRole('button', { name: /^Share/ }).click()
    await page.getByRole('link', { name: 'Discuss this version' }).click()
    await page.waitForURL(new RegExp(`/discuss/new\\?version=${saved.id}$`))
    await expect(page.getByText('Lesson reference:')).toBeVisible()

    await startDiscussion(page, `${MARK}About v1.0.1`, 'What changed in the starter?')
    await expect(page.getByRole('heading', { name: `${MARK}About v1.0.1` })).toBeVisible()
    await expect(page.getByText('What changed in the starter?')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Compare changes' })).toHaveAttribute(
      'href',
      `/lessons/${fx.plan.id}/compare?from=${fx.version.id}&to=${saved.id}`,
    )
    // The same component in Messages already has phone-sized reference links.
    for (const link of await page.locator('.lesson-reference a').all()) {
      const rect = await link.boundingBox()
      expect(rect?.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  })

  test('the picker prevents posting while versions load and until a version is chosen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/discuss/new`)
    await page.getByLabel('Title').fill(`${MARK}Picked`)
    await page.getByLabel('Post', { exact: true }).fill('Picked by hand.')
    const post = page.getByRole('button', { name: 'Post', exact: true })
    let releaseVersions!: () => void
    const versionsReady = new Promise<void>((resolve) => {
      releaseVersions = resolve
    })
    await page.route('**/api/lesson-bundle-versions?**', async (route) => {
      const response = await route.fetch()
      await versionsReady
      await route.fulfill({ response })
    })
    try {
      await page.getByRole('button', { name: 'Add lesson reference' }).click()
      const search = page.getByLabel('Find a lesson by its title')
      await search.fill(`${MARK}Plan`)
      await search.press('Enter')
      await expect(page).toHaveURL(`${BASE}/discuss/new`)
      const { totalDocs } = await fx.payload.count({
        collection: 'discussion-topics',
        where: { title: { equals: `${MARK}Picked` } },
        overrideAccess: true,
      })
      expect(totalDocs, 'Enter in lesson search must not create a discussion').toBe(0)
      await page.getByRole('button', { name: new RegExp(`${MARK}Plan`, 'i') }).click()
      await expect(page.getByText('Loading versions…')).toBeVisible()
      await expect(post).toBeDisabled()
      await expect(
        page.getByRole('group', { name: 'Add lesson reference' }).getByRole('status'),
      ).toBeVisible()
      await expect(
        page.getByRole('group', { name: 'Add lesson reference' }).getByRole('status'),
      ).toContainText('Choose a lesson version before posting, or cancel')
    } finally {
      releaseVersions()
    }
    await expect(
      page.getByRole('button', { name: 'Add reference: v1.0.1', exact: true }),
    ).toBeVisible()
    await expect(post).toBeDisabled()
    const addReference = page.getByRole('button', { name: 'Add reference: v1.0.1', exact: true })
    await expect(addReference).toHaveClass('btn')
    await expect(addReference).toHaveAccessibleDescription(/\d+ \w+ \d{4}/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await test.info().attach('reference-picker-mobile', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    await addReference.click()
    await expect(page.getByText('Lesson reference:')).toBeVisible()
    await expect(post).toBeEnabled()
    await post.click()
    await page.waitForURL(/\/discuss\/\d+$/)
    await expect(page.getByRole('link', { name: 'Compare changes' })).toBeVisible()
  })

  test('a reply waits for its selected lesson version and preserves the link', async ({ page }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/discuss/new`)
    await startDiscussion(page, `${MARK}Reply reference`, 'Please compare this version.')
    const topicId = Number(page.url().split('/').pop())
    const threadUrl = page.url()
    await page.getByLabel('Reply', { exact: true }).fill('Here is the version to compare.')
    const post = page.getByRole('button', { name: 'Post reply' })
    let releaseVersions!: () => void
    const versionsReady = new Promise<void>((resolve) => {
      releaseVersions = resolve
    })
    await page.route('**/api/lesson-bundle-versions?**', async (route) => {
      const response = await route.fetch()
      await versionsReady
      await route.fulfill({ response })
    })
    try {
      await page.getByRole('button', { name: 'Add lesson reference' }).click()
      const search = page.getByLabel('Find a lesson by its title')
      await search.fill(`${MARK}Plan`)
      await search.press('Enter')
      await expect(page).toHaveURL(threadUrl)
      const { totalDocs } = await fx.payload.count({
        collection: 'discussion-replies',
        where: { topic: { equals: topicId } },
        overrideAccess: true,
      })
      expect(totalDocs, 'Enter in lesson search must not create a reply').toBe(0)
      await page.getByRole('button', { name: new RegExp(`${MARK}Plan`, 'i') }).click()
      await expect(page.getByText('Loading versions…')).toBeVisible()
      await expect(post).toBeDisabled()
    } finally {
      releaseVersions()
    }
    await expect(
      page.getByRole('button', { name: 'Add reference: v1.0.1', exact: true }),
    ).toBeVisible()
    await expect(post).toBeDisabled()
    await page.getByRole('button', { name: 'Add reference: v1.0.1', exact: true }).click()
    await expect(post).toBeEnabled()
    await post.click()
    await page.waitForURL(/#reply-1$/)
    await expect(
      page.locator('#reply-1').getByRole('link', { name: 'Compare changes' }),
    ).toHaveAttribute('href', `/lessons/${fx.plan.id}/compare?from=${fx.version.id}&to=${saved.id}`)
  })

  test('a reply lights the author’s dot, and reading the thread clears it', async ({ browser }) => {
    const teacher = await browser.newPage()
    await loginAs(teacher, fx, 'teacher')
    await teacher.goto(`${BASE}/discuss/new`)
    await startDiscussion(teacher, `${MARK}Dot`, 'Anyone tried this?')
    const threadUrl = teacher.url()

    const editor = await browser.newPage()
    await loginAs(editor, fx, 'editor')
    await editor.goto(threadUrl)
    await editor.getByLabel('Reply', { exact: true }).fill('Yes — it works well.')
    await editor.getByRole('button', { name: 'Post reply' }).click()
    // ⚑ Wait for the SERVER-RENDERED reply on its own page, not the text: the typed text is on screen
    // before the post commits, and a teacher who looks then sees "0 replies" (a flake, 2026-10-11).
    await editor.waitForURL(/#reply-1$/)
    await expect(editor.locator('#reply-1')).toContainText('Yes — it works well.')

    await teacher.goto(`${BASE}/discuss`)
    await expect(
      primaryNav(teacher).getByRole('link', { name: 'Discuss (unread discussions)' }),
    ).toBeVisible()
    await expect(teacher.locator('.disc-row--unread', { hasText: `${MARK}Dot` })).toBeVisible()
    await expect(teacher.locator('.disc-row--unread', { hasText: `${MARK}Dot` })).toHaveCSS(
      'border-left-width',
      '3px',
    )

    const marked = teacher.waitForResponse((r) => r.url().includes('/mark-read') && r.ok())
    await teacher.getByRole('link', { name: `${MARK}Dot` }).click()
    await marked
    await teacher.goto(`${BASE}/discuss`)
    await expect(
      primaryNav(teacher).getByRole('link', { name: 'Discuss', exact: true }),
    ).toBeVisible()
    await expect(teacher.locator('.disc-row--unread', { hasText: `${MARK}Dot` })).toHaveCount(0)
    await Promise.all([teacher.close(), editor.close()])
  })

  test('a reply whose answer was lost is found by its key — on page 2 — and not posted twice', async ({
    page,
  }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/discuss/new`)
    await startDiscussion(page, `${MARK}Long thread`, 'Fifty replies follow.')
    const topicId = Number(page.url().split('/').pop())
    const db = drizzleOf(fx.payload)
    await db.execute(sql`
      INSERT INTO discussion_replies (topic_id, seq, body, author_id, submission_key)
      SELECT ${topicId}, g, 'Earlier reply ' || g, ${fx.users.editor.id}, ${`e2e-${topicId}-`} || g
        FROM generate_series(1, 50) g`)
    await db.execute(sql`UPDATE discussion_topics SET last_seq = 50 WHERE id = ${topicId}`)

    await page.goto(`${BASE}/discuss/${topicId}?page=1`)
    // Let the create reach the server, then drop its answer: the reply lands, the browser never hears.
    await page.route('**/api/discussion-replies', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fetch()
      await route.abort('failed')
    })
    await page.getByLabel('Reply', { exact: true }).fill('Reply fifty-one.')
    await page.getByRole('button', { name: 'Post reply' }).click()

    await page.waitForURL(new RegExp(`/discuss/${topicId}\\?page=2#reply-51$`))
    await expect(page.locator('#reply-51')).toContainText('Reply fifty-one.')
    const [{ count }] = rowsOf<{ count: number }>(
      await db.execute(
        sql`SELECT count(*)::int AS count FROM discussion_replies WHERE topic_id = ${topicId} AND body = 'Reply fifty-one.'`,
      ),
    )
    expect(count).toBe(1)
  })

  // ⚑ GPT review 2026-10-11, end to end: the first answer AND the lookup are lost, so the outcome is
  // unknown; a retry refused because the forum was switched off must NOT unlock the form (it says nothing
  // about the first attempt); the next retry meets the server's 409 and is resolved by key.
  test('an unknown outcome stays locked through a refused retry, then resolves through 409', async ({
    page,
  }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/discuss/new`)
    let firstPost = true
    let lookupDown = true
    await page.route('**/api/discussion-topics**', async (route) => {
      const request = route.request()
      if (request.method() === 'POST') {
        if (!firstPost) return route.continue()
        firstPost = false
        await route.fetch() // it lands…
        return route.abort('failed') // …and the answer is lost
      }
      return lookupDown ? route.abort('failed') : route.continue()
    })
    const title = `${MARK}Unknown outcome`
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Post', { exact: true }).fill('Did this post?')
    await page.getByRole('button', { name: 'Post', exact: true }).click()

    await expect(page.getByText('We could not tell whether that was posted')).toBeVisible()
    await expect(page.getByLabel('Title')).toHaveAttribute('readonly', '')

    await setForumEnabled(fx.payload, false)
    try {
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByText('copy it before you reload')).toBeVisible()
      await expect(page.getByLabel('Title'), 'a refused retry settles nothing').toHaveAttribute(
        'readonly',
        '',
      )
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    } finally {
      await setForumEnabled(fx.payload, true)
    }

    lookupDown = false
    await page.getByRole('button', { name: 'Try again' }).click()
    await page.waitForURL(/\/discuss\/\d+$/)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    const { totalDocs } = await fx.payload.count({
      collection: 'discussion-topics',
      where: { title: { equals: title } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(1)
  })

  test('Post about these changes is on the author’s saved version', async ({ page }) => {
    await loginAs(page, fx, 'editor')
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${saved.id}`)
    await expect(page.getByRole('link', { name: 'Post about these changes' })).toHaveAttribute(
      'href',
      `/discuss/new?version=${saved.id}`,
    )
  })

  test('an unavailable prefilled version is explained, not dropped silently', async ({ page }) => {
    await loginAs(page, fx, 'teacher')
    await page.goto(`${BASE}/discuss/new?version=999999999`)
    await expect(
      page.getByText('The lesson version you came from is no longer available'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add lesson reference' })).toBeVisible()
  })

  test('title search', async ({ page }) => {
    await loginAs(page, fx, 'teacher')
    // Its OWN topic: searching for one an earlier test created made this fail when run alone, or
    // after a worker restart (audit F-C72-001).
    await page.goto(`${BASE}/discuss/new`)
    await startDiscussion(page, `${MARK}Searchable`, 'Find me by title.')
    await page.goto(`${BASE}/discuss?q=${encodeURIComponent(`${MARK}Searchable`)}`)
    await expect(page.getByRole('link', { name: `${MARK}Searchable` })).toBeVisible()
    await page.goto(`${BASE}/discuss?q=nothing-matches-this-${Date.now()}`)
    await expect(page.getByText(/No discussion titles match/)).toBeVisible()
  })

  test('while the forum is off there is no page, nav item or entry point', async ({ page }) => {
    await loginAs(page, fx, 'teacher')
    await setForumEnabled(fx.payload, false)
    try {
      const res = await page.goto(`${BASE}/discuss`)
      expect(res?.status()).toBe(404)
      expect((await page.goto(`${BASE}/discuss/new`))?.status()).toBe(404)
      await page.goto(`${BASE}/lessons/${fx.plan.id}?version=${saved.id}`)
      await expect(primaryNav(page).getByRole('link', { name: /^Discuss/ })).toHaveCount(0)
      await page.getByRole('button', { name: /^Share/ }).click()
      await expect(page.getByRole('link', { name: 'Message a colleague' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Discuss this version' })).toHaveCount(0)
    } finally {
      await setForumEnabled(fx.payload, true)
    }
  })
})
