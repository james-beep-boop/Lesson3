import { devices } from '@playwright/test'
import base from '../../playwright.config'
const config = {
  ...base,
  testDir: '/app/tests/audit',
  testMatch: 'browser.audit.spec.ts',
  retries: 0,
  reporter: 'line',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
}

export default config
