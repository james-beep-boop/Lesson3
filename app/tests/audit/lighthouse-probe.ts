import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { setupRoleFixture, setForumEnabled } from '../helpers/fixtures'
import { login, HTTP_BASE } from '../helpers/httpWire'
import { welcomeDismissedKey } from '../../src/lib/welcomeDismissal'
type Report = {
  lhr: {
    finalDisplayedUrl?: string
    finalUrl?: string
    runtimeError?: { code: string; message: string }
    categories: Record<string, { score: number | null }>
    audits: Record<string, { numericValue?: number; details?: { items?: unknown[] } }>
  }
}
const modulePath = '/audit-tools/node_modules/lighthouse/core/index.js'
const { default: lighthouse } = (await import(modulePath)) as {
  default: (url: string, options: Record<string, unknown>) => Promise<Report | undefined>
}
const fx = await setupRoleFixture()
let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined
let forumBefore: boolean | undefined
try {
  forumBefore =
    (await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).features
      ?.forumEnabled ?? false
  await setForumEnabled(fx.payload, true)
  const token = await login(fx.users.editor.email, fx.password)
  context = await chromium.launchPersistentContext(`/tmp/audit-lighthouse-${process.pid}`, {
    headless: true,
    args: ['--remote-debugging-port=9222', '--no-sandbox'],
  })
  await context.addCookies([
    { name: 'payload-token', value: token, url: HTTP_BASE, httpOnly: true, sameSite: 'Lax' },
  ])
  await context.addInitScript(
    (key) => localStorage.setItem(key, '1'),
    welcomeDismissedKey(fx.users.editor.id),
  )
  const targets = [
    ['home and catalogue', '/'],
    ['lesson', `/lessons/${fx.plan.id}`],
    ['editor view', `/admin/collections/lesson-bundle-versions/${fx.version.id}`],
    ['discussions', '/discuss'],
    ['Guide', '/guide'],
  ]
  for (const [name, path] of targets) {
    const result = await lighthouse(HTTP_BASE + path, {
      port: 9222,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      disableStorageReset: true,
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 360,
        height: 800,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttlingMethod: 'simulate',
      maxWaitForLoad: 45000,
      maxWaitForFcp: 15000,
    })
    assert.ok(result)
    await writeFile(
      `/audit-output/lighthouse-${name.replaceAll(' ', '-')}.json`,
      JSON.stringify(result.lhr),
    )
    const lhr = result.lhr
    const final = new URL(lhr.finalDisplayedUrl ?? lhr.finalUrl ?? HTTP_BASE)
    console.log(
      JSON.stringify({
        scenario: name,
        path,
        finalPath: final.pathname,
        runtimeError: lhr.runtimeError ?? null,
        scores: Object.fromEntries(
          Object.entries(lhr.categories).map(([key, v]) => [key, v.score]),
        ),
        metrics: {
          lcpMs: lhr.audits['largest-contentful-paint']?.numericValue,
          blockingMs: lhr.audits['total-blocking-time']?.numericValue,
          cls: lhr.audits['cumulative-layout-shift']?.numericValue,
          totalBytes: lhr.audits['total-byte-weight']?.numericValue,
          requests: lhr.audits['network-requests']?.details?.items?.length,
        },
      }),
    )
    assert.equal(lhr.runtimeError, undefined, 'Lighthouse must measure a loaded app page')
    assert.equal(final.pathname, path, 'Lighthouse must not silently score the sign-in redirect')
  }
} finally {
  await context?.close()
  if (forumBefore !== undefined) await setForumEnabled(fx.payload, forumBefore)
  await fx.teardown()
}
process.exit(0)
