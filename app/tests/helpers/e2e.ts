/**
 * Shared browser-spec plumbing. Separate from `helpers/login.ts` ON PURPOSE: `login.ts` imports only
 * `@playwright/test` and drives the login FORM, so any spec can use it without pulling Payload in.
 * `loginAs` needs `RoleFixture`, which comes from `helpers/fixtures.ts` → `src/payload.config.js`, so
 * putting it in `login.ts` would drag the whole Payload config into the import graph of every future
 * spec that only wanted to sign a user in. Same split, and same reason, as `helpers/db.ts`.
 */
import type { Page } from '@playwright/test'

import { login } from './login'
import type { RoleFixture, RoleKey } from './fixtures'

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
 */
export async function loginAs(page: Page, fx: RoleFixture, key: RoleKey): Promise<void> {
  await login({
    page,
    serverURL: E2E_BASE,
    user: { email: fx.users[key].email, password: fx.password },
  })
}
