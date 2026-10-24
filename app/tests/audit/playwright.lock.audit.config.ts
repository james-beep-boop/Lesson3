import { defineConfig } from '@playwright/test'
import crawlConfig from './playwright.audit.config'

export default defineConfig({
  ...crawlConfig,
  testMatch: 'rbac-lock-ui.audit.spec.ts',
  maxFailures: 1,
  projects: [{ name: 'chromium' }],
})
