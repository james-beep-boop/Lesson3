/**
 * Public-posture guards (Phase 5 A5). Pins the two decisions lib/publicPosture.ts makes and the
 * cookie wiring in Users.ts: Secure derives from an https SERVER_URL, and a public host with an
 * empty users table refuses to boot (else first-register hands Site Admin to the first visitor —
 * verified live 2026-07-05). If this goes red, read lib/publicPosture.ts before "fixing" it.
 */
import { describe, it, expect } from 'vitest'

import { firstUserBootRefusal, isHttpsServerUrl } from '../../src/lib/publicPosture'

describe('isHttpsServerUrl (drives auth cookie Secure)', () => {
  it('true only for https URLs', () => {
    expect(isHttpsServerUrl('https://lessons.example.org')).toBe(true)
    expect(isHttpsServerUrl('http://rock5b:3001')).toBe(false)
    expect(isHttpsServerUrl('')).toBe(false)
    expect(isHttpsServerUrl(undefined)).toBe(false)
  })
})

describe('firstUserBootRefusal (onInit boot guard)', () => {
  const base = { serverUrl: 'https://lessons.example.org', userCount: 0, allowBootstrap: false }

  it('REFUSES: public posture + empty users + no escape hatch', () => {
    expect(firstUserBootRefusal(base)).toMatch(/refusing to boot/i)
  })

  it('boots: private posture (no SERVER_URL) with empty users — bootstrap is the design', () => {
    expect(firstUserBootRefusal({ ...base, serverUrl: undefined })).toBeNull()
    expect(firstUserBootRefusal({ ...base, serverUrl: '' })).toBeNull()
  })

  it('boots: users exist', () => {
    expect(firstUserBootRefusal({ ...base, userCount: 1 })).toBeNull()
  })

  it('boots: count unavailable (pre-schema migrate) — must not brick schema creation', () => {
    expect(firstUserBootRefusal({ ...base, userCount: null })).toBeNull()
  })

  it('boots: explicit ALLOW_FIRST_USER_BOOTSTRAP escape hatch', () => {
    expect(firstUserBootRefusal({ ...base, allowBootstrap: true })).toBeNull()
  })
})

describe('wiring', () => {
  it('Users auth cookie Secure is driven by the posture helper', async () => {
    const { Users } = await import('../../src/collections/Users')
    const cookies = (Users.auth as { cookies?: { secure?: boolean } }).cookies
    // SERVER_URL is unset/non-https in the test env → derived false; the property existing at all
    // proves the wiring (a hardcoded `true` would break internal HTTP hosts, `undefined` = unwired).
    expect(cookies).toBeDefined()
    expect(cookies?.secure).toBe(isHttpsServerUrl(process.env.SERVER_URL))
  })
})
