import { expect, type Page } from '@playwright/test'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Sign in via the single frontend login (`/login`). There is now ONE login form for both surfaces
 * — `/admin/login` redirects here (see next.config.ts) — so this establishes the shared session
 * cookie and lands on The App home (`/`). Admin specs navigate to `/admin` themselves afterward
 * (the session carries over).
 */
export async function login({
  page,
  serverURL = 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  await page.goto(`${serverURL}/login`)

  // The frontend form: type-based selectors (one email + one password input on the page).
  await page.locator('input[type="email"]').fill(user.email)
  await page.locator('input[type="password"]').fill(user.password)
  await page.locator('button[type="submit"]').click()

  // A successful login replaces the route with The App home; a failure stays on /login with an
  // error, so this wait is also the success assertion.
  await page.waitForURL(`${serverURL}/`)

  // ⚑ Landing on `/` is NOT sufficient evidence the login worked. The root layout renders the header
  // only when `user` is truthy, and a soft navigation would reuse the headerless shell cached for
  // /login — so a regression to `router.replace('/')` still passes `waitForURL` while every signed-in
  // user gets no nav. Asserting the header here pins the invariant for every spec that logs in, per
  // CLAUDE.md's rule that a security/correctness-critical invariant gets a test, not review alone.
  // (DECISIONS.md 2026-08-03.)
  await expect(page.locator('.app-header')).toBeVisible()
}
