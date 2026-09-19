import type { Payload } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OPERATOR_RESET_LINK_CONTEXT } from '../../src/hooks/authRateLimit'
import { recoverOfflineSiteAdmin } from '../../src/lib/offlineAdminRecovery'

const baseUser = {
  id: 41,
  name: 'Local Administrator',
  email: 'admin@example.com',
  roles: ['siteAdmin'],
  _verified: true,
  signInDisabled: false,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
}

const find = vi.fn()
const forgotPassword = vi.fn()
const payload = { find, forgotPassword } as unknown as Payload

beforeEach(() => {
  vi.stubEnv('ADMIN_URL', 'http://lesson3.local:3001')
  find.mockReset()
  forgotPassword.mockReset()
  find.mockResolvedValue({ docs: [baseUser] })
  forgotPassword.mockResolvedValue('one-time-token')
})

afterEach(() => vi.unstubAllEnvs())

describe('offline Site Administrator recovery', () => {
  it('is read-only until APPLY=1', async () => {
    await expect(recoverOfflineSiteAdmin(payload, ' ADMIN@example.com ', false)).resolves.toEqual({
      email: 'admin@example.com',
      name: 'Local Administrator',
      link: null,
    })
    expect(forgotPassword).not.toHaveBeenCalled()
  })

  it('mints a reset link through the operator-only Local-API allowance', async () => {
    await expect(recoverOfflineSiteAdmin(payload, 'admin@example.com', true)).resolves.toEqual({
      email: 'admin@example.com',
      name: 'Local Administrator',
      link: 'http://lesson3.local:3001/reset-password?token=one-time-token',
    })
    expect(forgotPassword).toHaveBeenCalledWith({
      collection: 'users',
      data: { email: 'admin@example.com' },
      disableEmail: true,
      overrideAccess: true,
      context: { [OPERATOR_RESET_LINK_CONTEXT]: true },
    })
  })

  it.each([
    ['a missing recovery email', undefined, [baseUser], /RECOVERY_EMAIL is required/i],
    ['no matching account', baseUser.email, [], /no account exists/i],
    [
      'an ambiguous account match',
      baseUser.email,
      [baseUser, { ...baseUser, id: 42 }],
      /more than one account/i,
    ],
    [
      'a non-administrator',
      baseUser.email,
      [{ ...baseUser, roles: [] }],
      /not a Site Administrator/i,
    ],
    [
      'an unverified administrator',
      baseUser.email,
      [{ ...baseUser, _verified: false }],
      /not verified/i,
    ],
    [
      'a disabled administrator',
      baseUser.email,
      [{ ...baseUser, signInDisabled: true }],
      /sign-in disabled/i,
    ],
  ])('refuses %s without minting a credential', async (_label, email, docs, message) => {
    find.mockResolvedValue({ docs })
    await expect(
      recoverOfflineSiteAdmin(payload, email as string | undefined, true),
    ).rejects.toThrow(message as RegExp)
    expect(forgotPassword).not.toHaveBeenCalled()
  })

  it('refuses to mint a link when the deployment has no public link base', async () => {
    vi.stubEnv('ADMIN_URL', '')
    vi.stubEnv('SERVER_URL', '')
    await expect(recoverOfflineSiteAdmin(payload, baseUser.email, true)).rejects.toThrow(
      /ADMIN_URL or SERVER_URL is required/i,
    )
    expect(forgotPassword).not.toHaveBeenCalled()
  })
})
