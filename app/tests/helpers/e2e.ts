/**
 * Shared browser-spec plumbing. Separate from `helpers/login.ts` ON PURPOSE: `login.ts` imports only
 * `@playwright/test` and drives the login FORM, so any spec can use it without pulling Payload in.
 * `loginAs` needs `RoleFixture`, which comes from `helpers/fixtures.ts` → `src/payload.config.js`, so
 * putting it in `login.ts` would drag the whole Payload config into the import graph of every future
 * spec that only wanted to sign a user in. Same split, and same reason, as `helpers/db.ts`.
 */
import type { Browser, Page } from '@playwright/test'

import { login } from './login'
import type { RoleFixture, RoleKey } from './fixtures'

/** The base URL every browser spec drives. Overridden by `E2E_BASE_URL` (e.g. the Rock over Tailscale). */
export const E2E_BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/**
 * Sign in as one of the fixture's seeded roles, in a fresh browser context, and return the page —
 * already ON the catalogue (`/`), because `login()` waits for that route and asserts the header.
 * A spec that wants the catalogue therefore needs NO `page.goto('/')` afterwards; that second
 * navigation is a second full server render of the route it is already looking at.
 */
export async function loginAs(browser: Browser, fx: RoleFixture, key: RoleKey): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login({ page, serverURL: E2E_BASE, user: { email: fx.users[key].email, password: fx.password } })
  return page
}
