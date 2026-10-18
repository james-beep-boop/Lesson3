import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshMutationAuthority } from '../../src/hooks/mutationAuthority'
import { lockRows, takeAdvisoryLock } from '../../src/lib/txDb'

vi.mock('../../src/lib/txDb', () => ({ takeAdvisoryLock: vi.fn(), lockRows: vi.fn() }))
vi.mock('../../src/lib/readBundle', () => ({
  findReadableVersion: vi.fn(async () => ({ lessonPlan: 9 })),
}))

type HookArgs = Parameters<typeof refreshMutationAuthority>[0]
function request(slug: string, operation = 'update', overrideAccess = false) {
  const current = { id: 7, roles: [], assignments: [], _verified: true }
  const req = {
    user: { id: 7, roles: ['siteAdmin'], collection: 'users', _strategy: 'local-jwt' },
    payload: { findByID: vi.fn(async () => current) },
  }
  const args = { id: '12' }
  const call = () =>
    refreshMutationAuthority({
      args,
      collection: { slug },
      operation,
      overrideAccess,
      req,
    } as unknown as HookArgs)
  return { call, req, args, current }
}
beforeEach(() => vi.clearAllMocks())

describe('native mutation authority', () => {
  it.each([
    ['users', 'update', 'users', 12],
    ['users', 'delete', 'users', 12],
    ['lesson-plans', 'update', 'lesson_plans', 12],
    ['lesson-plans', 'delete', 'lesson_plans', 12],
    ['lesson-bundle-versions', 'delete', 'lesson_plans', 9],
  ])('refreshes %s %s only after both lock waits', async (slug, operation, table, id) => {
    const { call, req, args } = request(slug as string, operation as string)
    vi.mocked(lockRows).mockImplementationOnce(async () => {
      expect(takeAdvisoryLock).toHaveBeenCalledWith(req, 'adminCount')
      expect(req.payload.findByID).not.toHaveBeenCalled()
    })
    expect(await call()).toBe(args)
    expect(lockRows).toHaveBeenCalledWith(req, table, [id])
    expect(req.user.roles).toEqual([])
    expect(req.user.collection).toBe('users')
    expect(req.user._strategy).toBe('local-jwt')
  })

  it('refuses verification revoked during the target-row wait', async () => {
    const { call, current } = request('users')
    vi.mocked(lockRows).mockImplementationOnce(async () => {
      current._verified = false
    })
    await expect(call()).rejects.toMatchObject({ status: 403 })
  })

  it('leaves trusted system writes to their own authorization boundary', async () => {
    const { call, req, args } = request('users', 'update', true)
    expect(await call()).toBe(args)
    expect(takeAdvisoryLock).not.toHaveBeenCalled()
    expect(req.payload.findByID).not.toHaveBeenCalled()
  })

  it('does not take write locks for reads', async () => {
    const { call, args } = request('lesson-plans', 'read')
    expect(await call()).toBe(args)
    expect(takeAdvisoryLock).not.toHaveBeenCalled()
  })
})
