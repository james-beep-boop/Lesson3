import { describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { refreshCaller, reassertSiteAdmin } from '../../src/endpoints/respond'

describe('post-wait caller refresh', () => {
  it.each([false, true])(
    'requires the authenticated session to remain present (present: %s)',
    async (present) => {
      const req = {
        user: { id: 7, roles: ['siteAdmin'], _verified: true, _sid: 'signed-in-session' },
        payload: {
          findByID: vi.fn(async () => ({
            id: 7,
            roles: ['siteAdmin'],
            _verified: true,
            sessions: present ? [{ id: 'signed-in-session' }] : [{ id: 'another-session' }],
          })),
        },
      } as unknown as PayloadRequest
      if (present) await expect(reassertSiteAdmin(req)).resolves.toBeUndefined()
      else await expect(reassertSiteAdmin(req)).rejects.toMatchObject({ status: 403 })
    },
  )

  it.each([false, null, undefined])(
    'refuses verification status %s even for an enabled administrator',
    async (_verified) => {
      const req = {
        user: { id: 7, roles: ['siteAdmin'], _verified: true },
        payload: { findByID: vi.fn(async () => ({ id: 7, roles: ['siteAdmin'], _verified })) },
      } as unknown as PayloadRequest
      await expect(reassertSiteAdmin(req)).rejects.toMatchObject({ status: 403 })
    },
  )

  it('refreshes current authority in place while preserving authentication metadata', async () => {
    const caller = {
      id: 7,
      roles: ['siteAdmin'],
      assignments: [],
      _verified: true,
      collection: 'users',
      _strategy: 'local-jwt',
    }
    const fresh = {
      id: 7,
      roles: [],
      assignments: [{ subjectGrade: 3, role: 'editor' }],
      _verified: true,
      signInDisabled: false,
    }
    const req = {
      user: caller,
      payload: { findByID: vi.fn(async () => fresh) },
    } as unknown as PayloadRequest
    expect(await refreshCaller(req)).toBe(caller)
    expect(req.user).toMatchObject({ ...fresh, collection: 'users', _strategy: 'local-jwt' })
    await expect(reassertSiteAdmin(req)).rejects.toMatchObject({ status: 403 })
  })
})
