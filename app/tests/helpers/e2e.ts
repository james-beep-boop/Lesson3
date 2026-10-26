/**
 * Shared browser-spec plumbing. Separate from `helpers/login.ts` ON PURPOSE: `login.ts` imports only
 * `@playwright/test` and drives the login FORM, so any spec can use it without pulling Payload in.
 * `loginAs` needs `RoleFixture`, which comes from `helpers/fixtures.ts` → `src/payload.config.js`, so
 * putting it in `login.ts` would drag the whole Payload config into the import graph of every future
 * spec that only wanted to sign a user in. Same split, and same reason, as `helpers/db.ts`.
 */
import type { Page } from '@playwright/test'

import { clearLoginTargetBudget } from './db'
import { login } from './login'
import type { RoleFixture, RoleKey } from './fixtures'
import { welcomeDismissedKey } from '../../src/lib/welcomeDismissal'

/** The base URL every browser spec drives. Overridden by `E2E_BASE_URL` (e.g. the Rock over Tailscale). */
export const E2E_BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/**
 * Sign the given page in as one of the fixture's seeded roles. After it resolves the page is already ON
 * the catalogue (`/`), because `login()` waits for that route and asserts the header — so a spec that
 * wants the catalogue needs NO `page.goto('/')` afterwards; that is a second full server render of the
 * route it is already looking at.
 *
 * ⚑ Takes the runner's `page` FIXTURE, not a `Browser`. The first version called `browser.newContext()`
 * itself and returned only the page, so every context was left undisposed — the caller had no handle to
 * close, and closing after the assertions (rather than in a `finally`) would have leaked on any failing
 * test regardless. Playwright owns a fixture's context and tears it down per test, including flushing
 * traces and video. The only constraint this imposes is one role per test, which is how every spec here
 * already worked.
 *
 * ⚑ IT CLEARS THE USER'S SIGN-IN BUDGET FIRST. Sign-in is throttled per client+address, 20 an hour
 * (`hooks/authRateLimit.ts`), and a spec shares one fixture across its tests — `manage.e2e.spec.ts` signs
 * its Site Administrator in 23 times. The 21st got a 429, which the login form shows as "Invalid email or
 * password", and the test passed on retry only because a retry starts a new worker with a fresh fixture
 * address (triaged 2026-10-11 with retries off: it failed every time). These specs test the pages behind
 * sign-in, not the throttle — that has its own wire tests — so each sign-in starts with a clean budget.
 */
export async function loginAs(
  page: Page,
  fx: RoleFixture,
  key: RoleKey,
  opts: { showWelcome?: boolean } = {},
): Promise<void> {
  await loginUser(page, fx, fx.users[key], opts)
}

/**
 * `loginAs` for an account a spec created itself rather than one of the fixture's four roles. Same
 * budget clearing and Welcome suppression (both ⚑ above); the password is the fixture's.
 */
export async function loginUser(
  page: Page,
  fx: RoleFixture,
  user: { id: number; email: string },
  opts: { showWelcome?: boolean } = {},
): Promise<void> {
  await clearLoginTargetBudget(fx.payload, user.email.toLowerCase())
  // ⚑ THE WELCOME DIALOG IS PRE-DISMISSED. Fixture accounts are brand new every run, so the first-login
  // dialog — a modal over the whole page — appeared on every page these specs open and intercepted
  // their clicks: 28 failures across Discussions, Manage and Messages (2026-10-17). These specs test
  // the pages, not the dialog; `welcomeDialog.e2e.spec.ts` tests the dialog and opts out with
  // `showWelcome`. An init script, so it holds for every navigation and reload on this page.
  if (!opts.showWelcome) {
    await page.addInitScript((storageKey) => {
      try {
        window.localStorage.setItem(storageKey, '1')
      } catch {
        // Storage disabled: the dialog would show, and the spec will say so on its first click.
      }
    }, welcomeDismissedKey(user.id))
  }
  await login({ page, serverURL: E2E_BASE, user: { email: user.email, password: fx.password } })
}
