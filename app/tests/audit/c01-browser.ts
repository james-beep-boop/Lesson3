/** C01 UI sign-in proof for every synthetic role; uses only the internal audit hostname. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const file = process.env.LESSON3_AUDIT_FIXTURE_FILE
assert(file, 'Private fixture file required')
const fixture = JSON.parse(await readFile(file, 'utf8')) as {
  run: string
  password: string
  accounts: Record<string, { email: string; verified: boolean }>
}
assert(fixture.run.startsWith('l3audit-'))
const browser = await chromium.launch({ headless: true })
let verified = 0
let refused = 0
try {
  for (const account of Object.values(fixture.accounts)) {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto('http://lesson3-audit:3000/login')
      await page.locator('input[type="email"]').fill(account.email)
      await page.locator('input[type="password"]').fill(fixture.password)
      const response = page.waitForResponse(
        (value) => value.url().endsWith('/api/users/login') && value.request().method() === 'POST',
      )
      await page.locator('button[type="submit"]').click()
      const login = await response
      if (account.verified) {
        assert.equal(login.status(), 200)
        await page.waitForURL('http://lesson3-audit:3000/')
        await page.locator('.app-header').waitFor({ state: 'visible' })
        verified++
      } else {
        assert.equal(login.status(), 403)
        assert.equal(new URL(page.url()).pathname, '/login')
        refused++
      }
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
assert.equal(verified, 8)
assert.equal(refused, 1)
console.log(JSON.stringify({ browserVerifiedLogins: verified, browserUnverifiedRefused: refused }))
