import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* ONE worker, always — not just on CI (changed 2026-08-04, when a second spec file was added).
     Every e2e spec seeds `setupRoleFixture`, which opens with a NAMESPACE-WIDE sweep
     (`purgeMarked(payload, MARK_BASE)`, fixtures.ts) to clear leftovers from crashed runs. That sweep
     is correct and worth keeping, but it means two spec files in parallel workers delete each other's
     fixtures — they share one database, and `MARK` is per-process while the sweep is per-namespace.
     With a single spec file this never surfaced; with two it fails immediately and confusingly (the
     victim reports a missing row, not a conflict). Serial is also what CI has always run, so this makes
     local match CI rather than changing the contract. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  // Local default: stand up the dev server. When E2E_BASE_URL points at an already-running stack
  // (e.g. the Rock over Tailscale, with DATABASE_URI tunnelled for fixture seeding — see the spec
  // headers), no local server is wanted: the specs read E2E_BASE_URL themselves.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        reuseExistingServer: true,
        url: 'http://localhost:3000',
      },
})
