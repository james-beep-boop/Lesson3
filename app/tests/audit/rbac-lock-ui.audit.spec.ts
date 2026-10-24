import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { auditAPI, auditBaseURL, auditFixture } from './client'

const fixture = auditFixture()
const base = auditBaseURL()
const output = process.env.LESSON3_AUDIT_ARTIFACT_DIR!
assert.equal(process.env.LESSON3_AUDIT_STORAGE_DIR, '/audit-states')
test('An ordinary Teacher cannot impersonate a lock holder and interrupt an authorized teacher', async ({
  browser,
  playwright,
}) => {
  const results: Record<string, unknown> = { version: fixture.plans.A.version, checks: [] }
  const file = path.join(output, 'lock-ui.json')
  const save = () => writeFile(file, JSON.stringify(results, null, 2), { mode: 0o600 })
  const contexts = new Map<string, APIRequestContext>()
  const state = (actor: string) => `/audit-states/states/${actor}.json`
  for (const actor of ['siteAdmin', 'teacher', 'editorAPeer']) {
    const context = await playwright.request.newContext({ storageState: state(actor) })
    contexts.set(actor, context)
    const me = await auditAPI(context)('GET', '/api/users/me')
    expect(((await me.json()) as { user?: { id: number } }).user?.id).toBe(
      fixture.accounts[actor].id,
    )
  }
  const admin = auditAPI(contexts.get('siteAdmin')!)
  const snapshot = async () => {
    const docs: unknown[] = []
    for (const route of [
      `/api/lesson-bundle-versions/${fixture.plans.A.version}?depth=0`,
      `/api/lesson-plans/${fixture.plans.A.plan}?depth=0`,
    ]) {
      const response = await admin('GET', route)
      expect(response.status()).toBe(200)
      docs.push(await response.json())
    }
    return createHash('sha256').update(JSON.stringify(docs)).digest('hex')
  }
  const before = await snapshot()
  results.before = before
  await save()
  const check = async (caller: string, claimedOwner: string, label: string) => {
    const item: Record<string, unknown> = { caller, claimedOwner, label }
    ;(results.checks as unknown[]).push(item)
    await save()
    let id: number | undefined
    let browserContext: Awaited<ReturnType<typeof browser.newContext>> | undefined
    try {
      const created = await auditAPI(contexts.get(caller)!)(
        'POST',
        '/api/payload-locked-documents',
        {
          document: { relationTo: 'lesson-bundle-versions', value: fixture.plans.A.version },
          user: { relationTo: 'users', value: fixture.accounts[claimedOwner].id },
        },
      )
      item.createStatus = created.status()
      await save()
      if (created.status() !== 201) {
        expect([401, 403, 404]).toContain(created.status())
        return { visible: false, denied: true }
      }
      id = ((await created.json()) as { doc: { id: number } }).doc.id
      item.id = id
      await save()
      browserContext = await browser.newContext({
        storageState: state('editorA'),
        viewport: { width: 1280, height: 900 },
      })
      const me = await auditAPI(browserContext.request)('GET', '/api/users/me')
      expect(((await me.json()) as { user?: { id: number } }).user?.id).toBe(
        fixture.accounts.editorA.id,
      )
      const outbound = new Set<string>()
      await browserContext.route('**/*', async (route) => {
        const url = new URL(route.request().url())
        if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) {
          outbound.add(url.hostname)
          await route.abort('blockedbyclient')
        } else await route.continue()
      })
      const page = await browserContext.newPage()
      const response = await page.goto(
        `${base}/admin/collections/lesson-bundle-versions/${fixture.plans.A.version}`,
      )
      expect(response?.status()).toBe(200)
      await page.waitForLoadState('networkidle')
      const takeover = page.locator('#document-locked-take-over')
      let visible = false
      try {
        await takeover.waitFor({ state: 'visible', timeout: 5_000 })
        visible = true
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error
      }
      item.modalVisible = visible
      item.outboundBlocked = [...outbound]
      item.finalPath = new URL(page.url()).pathname
      item.claimedOwnerEmailVisible =
        visible &&
        (await page.locator('.document-locked__content').innerText()).includes(
          fixture.accounts[claimedOwner].email,
        )
      if (visible)
        item.modalOwnerText = await page
          .locator('.document-locked__content strong')
          .first()
          .innerText()
      await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true })
      await save()
      return { visible, denied: false }
    } finally {
      if (browserContext) await browserContext.close()
      if (id !== undefined) {
        const deleted = await admin('DELETE', `/api/payload-locked-documents/${id}`)
        item.cleanupStatus = deleted.status()
        expect([200, 404]).toContain(deleted.status())
        expect((await admin('GET', `/api/payload-locked-documents/${id}?depth=0`)).status()).toBe(
          404,
        )
      }
      item.cleaned = true
      await save()
    }
  }
  try {
    const control = await check('editorAPeer', 'editorAPeer', 'authorized-lock-control')
    expect(
      control.visible,
      'A real peer lock must trigger the native modal before interpreting the attack',
    ).toBe(true)
    const attack = await check('teacher', 'siteAdmin', 'forged-lock-probe')
    expect(
      attack.visible,
      'A baseline Teacher must not create a false another-user editing warning',
    ).toBe(false)
  } finally {
    results.after = await snapshot()
    results.contentEqual = results.after === before
    await save()
    for (const context of contexts.values()) await context.dispose()
    expect(
      results.contentEqual,
      'Lock probes must not change native content or Official pointer',
    ).toBe(true)
  }
})
