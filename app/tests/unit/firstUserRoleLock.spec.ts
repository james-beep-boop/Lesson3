import { describe, expect, it } from 'vitest'

import { grantSiteAdminToFirstUser } from '../../src/hooks/userRoles'

function sqlText(query: unknown): string {
  return ((query as { queryChunks?: Array<{ value?: unknown }> }).queryChunks ?? [])
    .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join('') : ''))
    .join('')
}

describe('grantSiteAdminToFirstUser', () => {
  it('takes a transaction-scoped advisory lock before counting and granting', async () => {
    const events: string[] = []
    const data: { roles?: string[] } = {}
    const req = {
      transactionID: Promise.resolve('tx-first-user'),
      payload: {
        db: {
          sessions: {
            'tx-first-user': {
              db: {
                execute: async (query: unknown) => {
                  events.push(`lock:${sqlText(query)}`)
                },
              },
            },
          },
          drizzle: { execute: async () => undefined },
        },
        count: async () => {
          events.push('count')
          return { totalDocs: 0 }
        },
      },
    }

    await grantSiteAdminToFirstUser({ data, operation: 'create', req } as never)

    expect(events[0]).toMatch(/pg_advisory_xact_lock/)
    expect(events[1]).toBe('count')
    expect(data.roles).toEqual(['siteAdmin'])
  })

  it('fails closed when the create is not running in a transaction', async () => {
    const req = {
      payload: {
        db: { sessions: {}, drizzle: { execute: async () => undefined } },
        count: async () => ({ totalDocs: 0 }),
      },
    }

    await expect(
      grantSiteAdminToFirstUser({ data: {}, operation: 'create', req } as never),
    ).rejects.toThrow(/must run inside.*transaction/i)
  })
})
