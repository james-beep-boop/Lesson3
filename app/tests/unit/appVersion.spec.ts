import { describe, expect, it } from 'vitest'

import { appVersionLabel } from '../../src/lib/appVersion'

describe('installed app version', () => {
  it('distinguishes releases, untagged source builds and development builds', () => {
    expect(appVersionLabel('v0.95')).toBe('Version 0.95')
    expect(appVersionLabel('v1.2.3')).toBe('Version 1.2.3')
    expect(appVersionLabel('build-deadbee')).toBe('Build deadbee')
    expect(appVersionLabel('development')).toBe('Development build')
    expect(appVersionLabel(undefined)).toBe('Version unavailable')
    expect(appVersionLabel('')).toBe('Version unavailable')
    expect(appVersionLabel('latest')).toBe('Version unavailable')
  })
})
