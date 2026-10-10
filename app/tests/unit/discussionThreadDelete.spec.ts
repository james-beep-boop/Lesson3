import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  initTransaction: vi.fn(async () => true),
  commitTransaction: vi.fn(),
  killTransaction: vi.fn(),
}))
vi.mock('../../src/lib/txDb.js', () => ({
  lockRows: vi.fn(),
  lockUserForReference: vi.fn(async () => true),
  rowsOf: (result: unknown) => (result as { rows?: unknown[] })?.rows ?? [],
  txDb: vi.fn(async () => ({ execute: vi.fn(async () => ({ rows: [] })) })),
}))

import { commitTransaction, killTransaction } from 'payload'
import { lockRows } from '../../src/lib/txDb.js'
import { deleteThreadEndpoint } from '../../src/endpoints/discussionThreadDelete.js'

describe('thread deletion rechecks administrator permissions after waiting', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['demoted', { id: 7, roles: [] }],
    ['disabled', { id: 7, roles: ['siteAdmin'], signInDisabled: true }],
    ['deleted', null],
  ])('refuses a %s caller without deleting or logging', async (_change, currentCaller) => {
    let waited = false
    vi.mocked(lockRows).mockImplementation(async () => {
      waited = true
    })
    const findByID = vi.fn(async () => {
      expect(waited, 'permissions must be read after the wait').toBe(true)
      return currentCaller
    })
    const remove = vi.fn()
    const info = vi.fn()
    const req = {
      user: { id: 7, roles: ['siteAdmin'] },
      routeParams: { id: '12' },
      payload: { findByID, delete: remove, logger: { info } },
    } as unknown as PayloadRequest

    await expect(deleteThreadEndpoint.handler(req)).rejects.toMatchObject({ status: 403 })
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 7,
        overrideAccess: true,
        disableErrors: true,
        req,
      }),
    )
    expect(remove).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(commitTransaction).not.toHaveBeenCalled()
    expect(killTransaction).toHaveBeenCalledWith(req)
  })
})
