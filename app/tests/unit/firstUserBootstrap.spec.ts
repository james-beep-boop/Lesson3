import { describe, expect, it, vi } from 'vitest'

import { usersCollectionCreate } from '../../src/access'
import { hasRegisteredUsers } from '../../src/lib/firstUserBootstrap'

const access = (req: Record<string, unknown>) =>
  Promise.resolve(usersCollectionCreate({ req } as never))

describe('hasRegisteredUsers', () => {
  it('uses an access-bypassing count and preserves the supplied request', async () => {
    const req = { marker: 'same-request' }
    const count = vi.fn().mockResolvedValue({ totalDocs: 1 })

    await expect(hasRegisteredUsers({ count } as never, req as never)).resolves.toBe(true)
    expect(count).toHaveBeenCalledWith({
      collection: 'users',
      overrideAccess: true,
      req,
    })
  })
})

describe('usersCollectionCreate initial-setup gate', () => {
  it('refuses ordinary anonymous signup while the users table is empty', async () => {
    const count = vi.fn().mockResolvedValue({ totalDocs: 0 })
    await expect(access({ user: null, payload: { count } })).resolves.toBe(false)
  })

  it('allows ordinary anonymous signup after initial setup', async () => {
    const count = vi.fn().mockResolvedValue({ totalDocs: 1 })
    await expect(access({ user: null, payload: { count } })).resolves.toBe(true)
  })

  it('allows a Site Administrator without querying initialization state', async () => {
    const count = vi.fn()
    await expect(
      access({ user: { roles: ['siteAdmin'], assignments: [] }, payload: { count } }),
    ).resolves.toBe(true)
    expect(count).not.toHaveBeenCalled()
  })

  it('refuses an authenticated non-administrator without querying initialization state', async () => {
    const count = vi.fn()
    await expect(
      access({ user: { roles: [], assignments: [] }, payload: { count } }),
    ).resolves.toBe(false)
    expect(count).not.toHaveBeenCalled()
  })
})
