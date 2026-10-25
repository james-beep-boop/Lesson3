import { defineConfig } from '@playwright/test'

import base from './playwright.config'

/**
 * The computed-style comparison kit (`tests/style-snapshot/`, see its README). Not a test suite: each
 * spec writes a JSON dump to `STYLE_OUT` for `diff.mjs` to compare, so it is kept out of `tests/e2e`
 * and out of CI. Same browser, worker and server settings as the e2e config.
 */
export default defineConfig({ ...base, testDir: './tests/style-snapshot', reporter: 'line' })
