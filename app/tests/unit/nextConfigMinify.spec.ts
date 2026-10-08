import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Wiring guard. Next.js 16.4.0's production minifier leaves Payload's error classes anonymous, which turns every
 * server guard message into "An unknown error occurred." (DECISIONS 2026-10-08). The setting that prevents it
 * lives in `next.config.ts`, which this suite cannot execute; the over-the-wire proof is
 * `tests/http/apiErrorMessages.http.spec.ts`, run against the built app. This only stops the line being deleted
 * by accident — remove BOTH together once Next.js or Payload fixes the naming.
 */
describe('next.config.ts keeps Payload error names intact', () => {
  const source = readFileSync(path.resolve(__dirname, '../../next.config.ts'), 'utf8')

  it('keeps turbopackMinify off', () => {
    expect(source).toMatch(/turbopackMinify:\s*false/)
  })

  it('records why, next to the setting', () => {
    expect(source).toContain('apiErrorMessages.http.spec.ts')
  })
})
