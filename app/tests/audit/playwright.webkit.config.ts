import { devices } from '@playwright/test'
import base from '../../playwright.config.js'
const config = {
  ...base,
  testDir: '/app/tests/e2e',
  retries: 0,
  reporter: 'line',
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
}

export default config
