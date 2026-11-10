import { afterEach, describe, expect, it, vi } from 'vitest'

import { appVersionLabel, currentAppVersion } from '../../src/lib/appVersion'

describe('installed app version', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('distinguishes releases, untagged source builds and development builds', () => {
    expect(appVersionLabel('v0.95')).toBe('Version 0.95')
    expect(appVersionLabel('v1.2.3')).toBe('Version 1.2.3')
    expect(appVersionLabel('build-deadbee')).toBe('Build deadbee')
    expect(appVersionLabel('development')).toBe('Development build')
    expect(appVersionLabel(undefined)).toBe('Version unavailable')
    expect(appVersionLabel('')).toBe('Version unavailable')
    expect(appVersionLabel('latest')).toBe('Version unavailable')
  })

  // The sign-in page, the Guide footer and the account menu all read the version through this one
  // function, so a release image, a development server and an unlabelled build each show one answer.
  it('reads the release image first, then falls back to the development label only in development', () => {
    vi.stubEnv('APP_RELEASE_VERSION', 'v1.14')
    vi.stubEnv('NODE_ENV', 'development')
    expect(currentAppVersion()).toBe('v1.14')

    vi.stubEnv('APP_RELEASE_VERSION', undefined)
    expect(currentAppVersion()).toBe('development')

    vi.stubEnv('NODE_ENV', 'production')
    expect(currentAppVersion()).toBeUndefined()
  })
})
