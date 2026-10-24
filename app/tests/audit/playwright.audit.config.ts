import assert from 'node:assert/strict'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { auditBaseURL } from './client'

const output = process.env.LESSON3_AUDIT_ARTIFACT_DIR
assert(output, 'A private output directory outside the checkout is required')
assert(path.isAbsolute(output))
assert.equal(output, '/audit-output', 'Audit artifacts must use the dedicated private mount')
const phase = process.env.LESSON3_AUDIT_CRAWL_PHASE ?? 'surface'
assert(['surface', 'panels'].includes(phase), 'Unknown audit crawl phase')
export default defineConfig({
  testDir: '.',
  testMatch: phase === 'panels' ? 'c20-panels.audit.spec.ts' : 'c20-surface.audit.spec.ts',
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(output, 'playwright'),
  reporter: [['line']],
  use: {
    baseURL: auditBaseURL(),
    actionTimeout: 15_000,
    navigationTimeout: 25_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
