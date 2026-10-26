/** Published and locally built CLI containers must use the same version as the web app. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseLessonManifest } from '../../src/ingest/lessonManifest'

const appDir = join(__dirname, '..', '..')
const repoDir = process.env.LESSON3_REPO_ROOT ?? join(appDir, '..')
const dockerfile = readFileSync(join(appDir, 'Dockerfile'), 'utf8')
const compose = readFileSync(join(repoDir, 'docker-compose.yml'), 'utf8')
afterEach(() => vi.unstubAllEnvs())

describe('lesson import program version', () => {
  it('retains the release build argument in the production CLI image environment', () => {
    const builder = dockerfile.split('FROM base AS builder\n')[1]?.split('\nFROM ')[0]
    expect(builder).toBeDefined()
    expect(builder).toMatch(/^ARG APP_RELEASE_VERSION$/m)
    expect(builder).toMatch(/^ENV APP_RELEASE_VERSION=\$APP_RELEASE_VERSION$/m)
  })
  it('passes the same local Compose version to both image targets', () => {
    const migrate = compose.split('\n  migrate:\n')[1]?.split('\n  app:\n')[0]
    const app = compose.split('\n  app:\n')[1]?.split('\n  gotenberg:\n')[0]
    expect(migrate).toContain('APP_RELEASE_VERSION: "${APP_RELEASE_VERSION:-}"')
    expect(app).toContain('APP_RELEASE_VERSION: "${APP_RELEASE_VERSION:-}"')
  })
  it('accepts and refuses lesson sets using the installed tag, rather than the development fallback', () => {
    vi.stubEnv('APP_RELEASE_VERSION', 'v1.42')
    const manifest = (minProgram: string) =>
      JSON.stringify({
        format: 1,
        release: { id: 'Nov', date: '2026-11-14' },
        schemaVersion: '1.0.0',
        minProgram,
        files: {},
      })
    expect(parseLessonManifest(manifest('1.41'))?.minProgram).toBe('1.41')
    expect(() => parseLessonManifest(manifest('1.43'))).toThrow(/this program: 1.42/)
  })
})
