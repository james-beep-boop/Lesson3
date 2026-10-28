import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test, expect, type Page, type Locator } from '@playwright/test'
import { sql } from '@payloadcms/db-postgres'
import {
  setupRoleFixture,
  setForumEnabled,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'
import { loginAs, E2E_BASE as BASE } from '../helpers/e2e'
import { createTopicAs, clearPostingCaps } from '../helpers/discussions'
import { drizzleOf } from '../helpers/db'
import { welcomeDismissedKey } from '../../src/lib/welcomeDismissal'
import { openEditor, expandLessons } from '../helpers/editRecoveryUi'
const require = createRequire(import.meta.url)
type AxeResult = {
  violations: {
    id: string
    impact: string | null
    description: string
    nodes: { target: unknown; failureSummary?: string }[]
  }[]
}
type AxeRunner = { withTags: (tags: string[]) => AxeRunner; analyze: () => Promise<AxeResult> }
const { default: AxeBuilder } = require('/audit-tools/node_modules/@axe-core/playwright') as {
  default: new (options: { page: Page }) => AxeRunner
}
let fx: RoleFixture
let forumWas: boolean | undefined
const artifact = '/audit-output/browser-artifacts'
test.beforeAll(async () => {
  fx = await setupRoleFixture()
  forumWas =
    (await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).features
      ?.forumEnabled ?? undefined
  await setForumEnabled(fx.payload, true)
  await mkdir(artifact, { recursive: true })
})
test.afterAll(async () => {
  if (fx) {
    await clearPostingCaps(fx.payload, Object.values(fx.users))
    await setForumEnabled(fx.payload, forumWas ?? false)
    await fx.teardown()
  }
})

test('audit: title search has its own data and works in this browser', async ({ page }) => {
  const title = `${fx.plan.id} Audit independent search`
  await createTopicAs(fx.payload, fx.users.teacher, { title, body: 'Audit search fixture' })
  await loginAs(page, fx, 'teacher')
  await page.goto(`${BASE}/discuss?q=${encodeURIComponent(title)}`)
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
  await page.goto(`${BASE}/discuss?q=audit-no-match-${Date.now()}`)
  await expect(page.getByText(/No discussion titles match/)).toBeVisible()
})

test('audit: after a displayed new thread, paging and an uncertain reply preserve one post', async ({
  page,
}) => {
  const title = `Audit stable thread ${fx.plan.id}`
  await loginAs(page, fx, 'teacher')
  await page.goto(`${BASE}/discuss/new`)
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Post', { exact: true }).fill('Audit body')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const id = Number(new URL(page.url()).pathname.split('/').pop())
  expect(Number.isSafeInteger(id)).toBe(true)
  const db = drizzleOf(fx.payload)
  await db.execute(
    sql`INSERT INTO discussion_replies (topic_id,seq,body,author_id,submission_key) SELECT ${id},g,'Audit earlier reply',${fx.users.editor.id},${`audit-${id}-`}||g FROM generate_series(1,50) g`,
  )
  await db.execute(sql`UPDATE discussion_topics SET last_seq=50 WHERE id=${id}`)
  await page.goto(`${BASE}/discuss/${id}?page=1`)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.route('**/api/discussion-replies', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fetch()
    await route.abort('failed')
  })
  await page.getByLabel('Reply', { exact: true }).fill('Audit uncertain reply')
  await page.getByRole('button', { name: 'Post reply', exact: true }).click()
  await page.waitForURL(new RegExp(`/discuss/${id}\\?page=2#reply-51$`))
  await page.unroute('**/api/discussion-replies')
  await expect(page.locator('#reply-51')).toContainText('Audit uncertain reply')
  const rows = await fx.payload.find({
    collection: 'discussion-replies',
    where: { and: [{ topic: { equals: id } }, { body: { equals: 'Audit uncertain reply' } }] },
    overrideAccess: true,
    depth: 0,
    pagination: false,
  })
  expect(rows.docs).toHaveLength(1)
})

test('audit: route, viewport and accessibility crawl', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(600000)
  const findings: unknown[] = []
  const roles: (RoleKey | null)[] = [null, 'teacher', 'editor', 'subjectAdmin', 'siteAdmin']
  for (const role of roles) {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      if (role) await loginAs(page, fx, role)
      const paths = role
        ? ['/', '/guide', `/lessons/${fx.plan.id}`, '/messages', '/discuss', '/admin']
        : ['/login', '/signup', '/guide', '/explore']
      for (const width of [360, 768, 1280])
        for (const path of paths) {
          await page.setViewportSize({ width, height: 900 })
          const response = await page.goto(`${BASE}${path}`)
          await page.locator('body').waitFor()
          const metrics = await page.evaluate(() => ({
            width: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            title: document.title,
            h1: [...document.querySelectorAll('h1')].map((x) => x.textContent),
          }))
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
          const name = `${browserName}-${role ?? 'anonymous'}-${width}-${path.replace(/[^a-z0-9]/gi, '_')}`
          await page.screenshot({ path: `${artifact}/${name}.png`, fullPage: true })
          findings.push({
            role,
            width,
            path,
            status: response?.status(),
            finalPath: new URL(page.url()).pathname,
            metrics,
            violations: axe.violations,
          })
        }
    } finally {
      await context.close()
    }
  }
  await writeFile(
    `${artifact}/${browserName}-crawl.json`,
    JSON.stringify({ source: '6e75a173e822e4c4be42821b0a4af48ca457bd36', findings }, null, 2),
  )
  await testInfo.attach('crawl-summary', {
    body: JSON.stringify({ pages: findings.length, browser: browserName }),
    contentType: 'application/json',
  })
})

async function keyboardReach(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible()
  for (let i = 0; i < 300; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  console.log(
    JSON.stringify({
      keyboardFailure: await target.evaluate((el) => ({
        target: el.tagName,
        label: el.getAttribute('aria-label'),
        tabindex: el.getAttribute('tabindex'),
        html: el.outerHTML.slice(0, 300),
        active: document.activeElement?.outerHTML.slice(0, 300),
      })),
    }),
  )
  throw new Error('Audit keyboard traversal could not reach the requested visible control')
}
test('audit: keyboard-only sign-in, search, edit, save, download and discussion', async ({
  page,
}, info) => {
  test.setTimeout(360000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}/login`)
  await keyboardReach(page, page.locator('input[type=email]'))
  await page.keyboard.insertText(fx.users.editor.email)
  await keyboardReach(page, page.locator('input[type=password]'))
  await page.keyboard.insertText(fx.password)
  await keyboardReach(page, page.locator('button[type=submit]'))
  await page.keyboard.press('Enter')
  await page.waitForURL(`${BASE}/`)
  const welcome = page.getByRole('dialog')
  await expect(welcome).toBeVisible()
  await keyboardReach(page, page.getByRole('button', { name: 'Dismiss', exact: true }))
  await page.keyboard.press('Enter')
  await expect(welcome).not.toBeVisible()
  await keyboardReach(page, page.getByLabel('Search lesson plans'))
  await page.keyboard.insertText(fx.subject.name)
  const lessonLink = page.locator(`a.substrand-link[href="/lessons/${fx.plan.id}"]`)
  await keyboardReach(page, lessonLink)
  await page.keyboard.press('Enter')
  await page.waitForURL(new RegExp(`/lessons/${fx.plan.id}`))
  await keyboardReach(page, page.getByRole('button', { name: 'Edit', exact: true }))
  await page.keyboard.press('Enter')
  await page.waitForURL(new RegExp(`/admin/collections/lesson-bundle-versions/${fx.version.id}`))
  await expect(page.locator('.lp-recovery')).toBeVisible()
  await keyboardReach(page, page.getByRole('button', { name: 'Show All', exact: true }).first())
  await page.keyboard.press('Enter')
  const overview = page.locator('#field-lessons__0__overview')
  await keyboardReach(page, overview)
  await page.keyboard.press('ControlOrMeta+End')
  const suffix = ` Audit keyboard text ${info.project.name}`
  await page.keyboard.insertText(suffix)
  await keyboardReach(page, page.getByRole('button', { name: 'Save as new version', exact: true }))
  await page.keyboard.press('Enter')
  await page.waitForURL(
    (url) =>
      /\/admin\/collections\/lesson-bundle-versions\/\d+/.test(url.pathname) &&
      !url.pathname.endsWith(`/${fx.version.id}`),
  )
  const id = Number(new URL(page.url()).pathname.split('/').pop())
  const saved = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id,
    overrideAccess: true,
    depth: 0,
  })
  expect(saved.lessons?.[0].overview).toContain(suffix)
  await keyboardReach(page, page.getByRole('link', { name: 'Back to lesson', exact: true }))
  await page.keyboard.press('Enter')
  await page.waitForURL(new RegExp(`/lessons/${fx.plan.id}`))
  const word = page.getByRole('button', { name: 'Word', exact: true }).first()
  await keyboardReach(page, word)
  const download = page.waitForEvent('download', { timeout: 120000 })
  await page.keyboard.press('Enter')
  expect((await download).suggestedFilename()).toMatch(/\.docx$/)
  const pdf = page.getByRole('button', { name: 'PDF', exact: true }).first()
  await keyboardReach(page, pdf)
  const popup = page.waitForEvent('popup')
  const response = page.context().waitForEvent('response', {
    predicate: (r) =>
      r.url().includes('/export/doc?') &&
      r.headers()['content-type']?.includes('application/pdf') === true,
    timeout: 120000,
  })
  await page.keyboard.press('Enter')
  const tab = await popup
  expect((await response).status()).toBe(200)
  await tab.close()
  await keyboardReach(page, page.locator('a.app-nav__link[href="/discuss"]'))
  await page.keyboard.press('Enter')
  await page.waitForURL(`${BASE}/discuss`)
  await keyboardReach(page, page.getByRole('link', { name: 'Start a discussion', exact: true }))
  await page.keyboard.press('Enter')
  await page.waitForURL(`${BASE}/discuss/new`)
  await keyboardReach(page, page.getByLabel('Title', { exact: true }))
  const title = `Audit keyboard discussion ${fx.plan.id}`
  await page.keyboard.insertText(title)
  await keyboardReach(page, page.getByLabel('Post', { exact: true }))
  await page.keyboard.insertText('Created using keyboard navigation only.')
  await keyboardReach(page, page.getByRole('button', { name: 'Post', exact: true }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  console.log(
    JSON.stringify({
      keyboardJourney: info.project.name,
      stages: [
        'sign in',
        'dismiss welcome',
        'search',
        'open lesson',
        'edit',
        'save verified in database',
        'Word download',
        'PDF delivery',
        'discussion post',
      ],
    }),
  )
})

for (const mode of ['unsafe before deadline', 'becomes unsafe during logout'] as const) {
  test(`audit: lesson form keeps the last copy when ${mode}`, async ({ page }, info) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await loginAs(page, fx, 'editor')
    const started = page.waitForResponse(
      (r) => r.url().endsWith('/recovery/start') && r.request().method() === 'POST',
    )
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${fx.version.id}`)
    await page.getByRole('button', { name: /^(Edit|Continue editing)$/ }).click()
    expect((await started).status()).toBe(200)
    await page.getByRole('button', { name: 'Show All', exact: true }).first().click()
    const overview = page.locator('#field-lessons__0__overview')
    await expect(overview).toBeEditable()
    const cookie = (await page.context().cookies()).find((c) => c.name === 'payload-token')
    expect(cookie).toBeTruthy()
    const expiration =
      (
        JSON.parse(Buffer.from(cookie!.value.split('.')[1], 'base64url').toString()) as {
          exp: number
        }
      ).exp * 1000
    let release!: () => void
    let signal!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = new Promise<void>((resolve) => {
      signal = resolve
    })
    await page.route('**/api/users/logout', async (route) => {
      signal()
      await held
      await route.continue()
    })
    const marker = `Audit last copy ${mode} ${info.project.name} ${fx.plan.id}`
    if (mode === 'unsafe before deadline') {
      await overview.fill(marker)
      await expect(
        page.getByRole('button', { name: 'Save as new version', exact: true }),
      ).toBeEnabled()
    }
    // Move only the browser wall clock. Native force-logout timers keep their original delay.
    // This isolates the real focus-triggered backstop without waiting two hours or editing the app.
    await page.clock.setFixedTime(new Date(expiration + 1000))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await pending
    if (mode === 'becomes unsafe during logout') {
      await expect(overview).toBeEditable()
      await overview.click()
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.insertText(marker)
      await expect(overview).toHaveValue(marker)
    }
    const navigation = page.waitForURL(/logout-inactivity/, { timeout: 4000 }).then(
      () => true,
      () => false,
    )
    release()
    const navigated = await navigation
    const rows = await fx.payload.find({
      collection: 'edit-recovery',
      where: {
        and: [
          { user: { equals: fx.users.editor.id } },
          { sourceVersion: { equals: fx.version.id } },
        ],
      },
      overrideAccess: true,
      depth: 0,
    })
    const persisted = JSON.stringify(rows.docs[0]?.content).includes(marker)
    const inputReadable =
      (await overview.isVisible()) && (await overview.inputValue()).includes(marker)
    const visibleTextReadable = (await page.locator('body').innerText()).includes(marker)
    console.log(
      JSON.stringify({
        expiryProbe: info.project.name,
        mode,
        navigated,
        persisted,
        inputReadable,
        visibleTextReadable,
        clock: 'controlled browser wall-clock jump; server clock unchanged',
      }),
    )
    expect(
      persisted || inputReadable || visibleTextReadable,
      'Unpersisted work must remain readable after the real logout completes',
    ).toBe(true)
    if (mode === 'unsafe before deadline') expect(navigated).toBe(false)
  })
}

for (const captureFails of [true, false]) {
  test(`audit: native session expiry preserves lesson text with ${captureFails ? 'unavailable' : 'confirmed'} capture`, async ({
    page,
  }, info) => {
    const visited: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname)
    })
    test.setTimeout(155000)
    const auth = fx.payload.collections.users.config.auth
    if (!auth) throw new Error('Native user auth configuration required')
    const prior = auth.tokenExpiration
    let token: string | undefined
    // Change only this isolated SDK issuer in memory, then restore it. The running app is untouched.
    try {
      auth.tokenExpiration = 120
      token = (
        await fx.payload.login({
          collection: 'users',
          data: { email: fx.users.editor.email, password: fx.password },
        })
      ).token
    } finally {
      auth.tokenExpiration = prior
    }
    expect(token).toBeTruthy()
    const expires = (
      JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString()) as { exp: number }
    ).exp
    await page.context().addCookies([
      {
        name: 'payload-token',
        value: token!,
        url: BASE,
        httpOnly: true,
        sameSite: 'Lax',
        expires,
      },
    ])
    await page.addInitScript(
      (key) => localStorage.setItem(key, '1'),
      welcomeDismissedKey(fx.users.editor.id),
    )
    // Model a failed refresh transport and unavailable capture; do not fake the server's expiry clock.
    await page.route('**/api/users/refresh-token**', (r) => r.abort('failed'))
    await page.route(`**/api/lesson-bundle-versions/${fx.version.id}/recovery`, (r) =>
      captureFails && r.request().method() === 'POST'
        ? r.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              errors: [{ message: 'Audit simulated capture unavailability' }],
            }),
          })
        : r.continue(),
    )
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${fx.version.id}`)
    await page.getByRole('button', { name: /^(Edit|Continue editing)$/ }).click()
    await page.getByRole('button', { name: 'Show All', exact: true }).first().click()
    const overview = page.locator('#field-lessons__0__overview')
    const marker = `Audit native-expiry only copy ${info.project.name} ${fx.plan.id}`
    const refused = page.waitForResponse(
      (r) =>
        r.url().endsWith('/recovery') &&
        r.request().method() === 'POST' &&
        r.status() === (captureFails ? 503 : 200),
    )
    await overview.fill(marker)
    await expect(
      page.getByRole('button', { name: 'Save as new version', exact: true }),
    ).toBeEnabled()
    await refused
    console.log(
      JSON.stringify({
        nativeExpiryProbe: info.project.name,
        stage: `${captureFails ? 'capture refused' : 'capture confirmed'}; waiting for genuine native token expiry`,
        secondsLeft: Math.ceil(expires - Date.now() / 1000),
      }),
    )
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, expires * 1000 - Date.now() + 1500)),
    )
    const me = await page.request.get(`${BASE}/api/users/me`, {
      headers: { Authorization: `JWT ${token}` },
    })
    const who = (await me.json()) as { user?: unknown }
    expect(who.user).toBeFalsy()
    const navigated = await page.waitForURL(/logout-inactivity/, { timeout: 4000 }).then(
      () => true,
      () => false,
    )
    await page.waitForTimeout(6000)
    console.log(
      JSON.stringify({
        nativeExpiryFinal: info.project.name,
        path: new URL(page.url()).pathname,
        visited,
        bodyCharacters: (await page.locator('body').innerText()).length,
      }),
    )
    await page.screenshot({
      path: `${artifact}/${info.project.name}-native-expiry-${captureFails ? 'unavailable' : 'confirmed'}.png`,
    })
    const rows = await fx.payload.find({
      collection: 'edit-recovery',
      where: {
        and: [
          { user: { equals: fx.users.editor.id } },
          { sourceVersion: { equals: fx.version.id } },
        ],
      },
      overrideAccess: true,
      depth: 0,
    })
    const persisted = JSON.stringify(rows.docs[0]?.content).includes(marker)
    const inputReadable =
      (await overview.isVisible()) && (await overview.inputValue()).includes(marker)
    const visibleTextReadable = (await page.locator('body').innerText()).includes(marker)
    console.log(
      JSON.stringify({
        nativeExpiryProbe: info.project.name,
        stage: 'expired',
        serverRecognizesUser: Boolean(who.user),
        navigated,
        persisted,
        inputReadable,
        visibleTextReadable,
        clock: 'real browser and server clocks; native SDK-issued two-minute session',
      }),
    )
    expect(
      persisted || inputReadable || visibleTextReadable,
      'Session expiry must preserve a confirmed capture or leave unconfirmed work readable',
    ).toBe(true)
  })
}

test('audit: stored teacher text remains inert in sampled browser surfaces', async ({
  page,
}, info) => {
  test.setTimeout(120000)
  const probe = '<img src=x onerror="window.__auditExecuted=1">'
  const signedIn = async (role: RoleKey) => {
    const response = await page.request.post(`${BASE}/api/users/login`, {
      data: { email: fx.users[role].email, password: fx.password },
    })
    expect(response.status()).toBe(200)
    return ((await response.json()) as { token: string }).token
  }
  const teacher = await signedIn('teacher')
  const headers = { Authorization: `JWT ${teacher}` }
  const name = await page.request.patch(`${BASE}/api/users/${fx.users.teacher.id}`, {
    headers,
    data: { name: probe },
  })
  expect(name.status()).toBe(200)
  const topic = await page.request.post(`${BASE}/api/discussion-topics`, {
    headers,
    data: {
      title: `Audit ${fx.plan.id} ${probe}`,
      body: probe,
      submissionKey: crypto.randomUUID(),
    },
  })
  expect(topic.status()).toBe(201)
  const topicId = ((await topic.json()) as { doc: { id: number } }).doc.id
  const reply = await page.request.post(`${BASE}/api/discussion-replies`, {
    headers,
    data: { topic: topicId, body: probe, joinedAtSeq: 0, submissionKey: crypto.randomUUID() },
  })
  expect(reply.status()).toBe(201)
  const message = await page.request.post(`${BASE}/api/messages`, {
    headers,
    data: { recipient: fx.users.editor.id, body: probe },
  })
  expect(message.status()).toBe(201)
  const editing = await signedIn('editor')
  const source = structuredClone(fx.version)
  source.lessons![0].overview = probe
  const data = new FormData()
  data.set('data', JSON.stringify(source))
  const save = await fetch(`${BASE}/api/lesson-bundle-versions/${source.id}/save-as-new`, {
    method: 'POST',
    headers: { Authorization: `JWT ${editing}` },
    body: data,
  })
  expect(save.status).toBe(200)
  const candidate = ((await save.json()) as { id: number }).id
  const checked = []
  for (const path of [
    '/discuss',
    `/discuss/${topicId}`,
    '/messages',
    `/lessons/${fx.plan.id}?version=${candidate}`,
    `/admin/collections/lesson-bundle-versions/${candidate}`,
    `/api/lesson-bundle-versions/${candidate}/preview`,
  ]) {
    await page.goto(BASE + path)
    await page.locator('body').waitFor()
    if (path.startsWith('/admin/')) {
      await page.getByRole('button', { name: /^(Edit|Continue editing)$/ }).click()
      await page.getByRole('button', { name: 'Show All', exact: true }).first().click()
      await expect(page.locator('#field-lessons__0__overview')).toHaveValue(probe)
    } else if (path.startsWith('/discuss/')) {
      await expect(page.locator('.disc-post__text').first()).toContainText(probe)
      await expect(page.locator('.disc-post__text').last()).toContainText(probe)
      await expect(page.locator('.disc-post__meta').first()).toContainText(probe)
    } else if (path === '/messages')
      await expect(page.locator('.msg-body').first()).toContainText(probe)
    else if (path.startsWith('/lessons/'))
      await expect(page.locator('.doc-preview').first()).toContainText(probe)
    else await expect(page.locator('body')).toContainText(probe)
    expect(await page.evaluate(() => Reflect.get(window, '__auditExecuted'))).toBeUndefined()
    expect(await page.locator('[onerror*="__auditExecuted"]').count()).toBe(0)
    checked.push({
      path: path.replace(String(candidate), ':candidate').replace(String(topicId), ':topic'),
      scriptExecuted: false,
      activePayloadElements: 0,
    })
  }
  console.log(
    JSON.stringify({
      storedTextProbe: info.project.name,
      checked,
      limits:
        'One img/onerror payload in names, topic titles/bodies, replies, messages and lesson prose; browser/frontend/admin/HTML preview samples only. Email and Office viewers not exercised.',
    }),
  )
})

test('audit: consecutive link insertions use the visible caret in both browsers', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loginAs(page, fx, 'editor')
  await openEditor(page, fx.version.id)
  await expandLessons(page)
  for (const button of await page.getByRole('button', { name: 'Show All', exact: true }).all())
    if (await button.isVisible()) await button.click()
  const field = page.locator('#field-lessons__0__framework__0__learnerExperience')
  await field.fill('Alpha Beta')
  await field.press('Home')
  for (let i = 0; i < 5; i++) await field.press('ArrowRight')
  const insert = page.getByRole('button', { name: 'Insert link', exact: true })
  for (const suffix of ['one', 'two']) {
    if (suffix === 'two') {
      const caret = await field.evaluate((el) => (el as HTMLTextAreaElement).selectionStart)
      expect(caret).toBeLessThan((await field.inputValue()).indexOf('Beta'))
    }
    await insert.click()
    const dialog = page.getByRole('dialog', { name: 'Insert link' })
    await dialog.getByLabel('Web address').fill(`https://example.invalid/${suffix}`)
    await dialog.getByRole('button', { name: 'Insert address', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(field).toBeFocused()
  }
  const value = await field.inputValue()
  console.log(
    JSON.stringify({
      consecutiveLinkProbe: info.project.name,
      oneBeforeTwo: value.indexOf('/one') < value.indexOf('/two'),
      twoBeforeTrailingWord: value.indexOf('/two') < value.indexOf('Beta'),
    }),
  )
  expect(value.indexOf('/one')).toBeLessThan(value.indexOf('/two'))
  expect(value.indexOf('/two'), 'Second insertion must remain before trailing text').toBeLessThan(
    value.indexOf('Beta'),
  )
})

test('audit: reset-link copy gives manual instructions on a plain HTTP school origin', async ({
  page,
}, info) => {
  await loginAs(page, fx, 'siteAdmin')
  await page.goto(`${BASE}/admin?open=users,users.accounts`)
  const search = page.locator('.lp-users__filters input[type="search"]')
  await search.fill(fx.users.teacher.email)
  const row = page
    .locator('.lp-users__row')
    .filter({ has: page.locator('.lp-users__summary').filter({ hasText: fx.users.teacher.email }) })
  await expect(row).toHaveCount(1)
  await row.locator('.lp-users__summary').click()
  await row.getByRole('button', { name: 'Reveal reset link', exact: true }).click()
  await expect(row.locator('.lp-users__reset input')).toHaveValue(/\/reset-password\?token=/)
  const contextFacts = await page.evaluate(() => ({
    secure: window.isSecureContext,
    hasClipboard: typeof navigator.clipboard !== 'undefined',
  }))
  expect(contextFacts.secure).toBe(false)
  expect(contextFacts.hasClipboard).toBe(false)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await row.getByRole('button', { name: 'Copy link', exact: true }).click()
  console.log(
    JSON.stringify({
      resetCopyProbe: info.project.name,
      ...contextFacts,
      clipboardTypeErrors: errors.filter((message) => message.includes('writeText')).length,
      manualInputStillVisible: await row.locator('.lp-users__reset input').isVisible(),
    }),
  )
  await expect(row).toContainText('Could not copy automatically — select and copy the link below.')
})
