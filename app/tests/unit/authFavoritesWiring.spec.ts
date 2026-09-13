import { describe, expect, it, vi } from 'vitest'

import { siteAdminOnly } from '../../src/access'
import { Messages } from '../../src/collections/Messages'
import { Users } from '../../src/collections/Users'
import { markMessagesReadEndpoint } from '../../src/endpoints/markMessagesRead'

const callers = [
  { label: 'anonymous caller', user: null, unlock: false },
  { label: 'Teacher', user: { id: 1, roles: [] }, unlock: false },
  {
    label: 'Teacher with editing access',
    user: { id: 2, assignments: [{ subjectGrade: 7, role: 'editor' }] },
    unlock: false,
  },
  {
    label: 'Subject Administrator',
    user: { id: 3, assignments: [{ subjectGrade: 7, role: 'subjectAdmin' }] },
    unlock: false,
  },
  { label: 'Site Administrator', user: { id: 4, roles: ['siteAdmin'] }, unlock: true },
]

describe('native unlock access wiring', () => {
  it('uses the Site-Admin gate on the independent unlock operation', () => {
    expect(Users.access?.unlock).toBe(siteAdminOnly)
  })

  it.each(callers)('$label: unlock access is $unlock', async ({ user, unlock }) => {
    expect(await Users.access!.unlock!({ req: { user } } as never)).toBe(unlock)
  })
})

describe('read receipts are system-written', () => {
  it.each(callers)('denies create and update field access to $label', async ({ user }) => {
    const field = Messages.fields.find((field) => 'name' in field && field.name === 'readAt')
    if (!field || field.type !== 'date') throw new Error('readAt date field is missing')
    const args = { req: { user }, data: { readAt: '2000-01-01T00:00:00.000Z' } } as never
    expect(await field.access?.create?.(args)).toBe(false)
    expect(await field.access?.update?.(args)).toBe(false)
  })

  it('keeps mark-read registered as a POST', () => {
    expect(Messages.endpoints).toContain(markMessagesReadEndpoint)
    expect(markMessagesReadEndpoint).toMatchObject({ path: '/mark-read', method: 'post' })
  })

  it('refuses anonymous mark-read before reading the body or writing', async () => {
    const update = vi.fn()
    const json = vi.fn()
    await expect(
      markMessagesReadEndpoint.handler({ user: null, payload: { update }, json } as never),
    ).rejects.toMatchObject({ status: 401 })
    expect(json).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('uses a recipient-scoped system write and never trusts a supplied readAt', async () => {
    const update = vi.fn().mockResolvedValue({ docs: [{ id: 10 }] })
    const req = {
      user: { id: 7 },
      payload: { update },
      headers: new Headers(),
      json: async () => ({ ids: [10, 11], readAt: '2000-01-01T00:00:00.000Z' }),
    }
    const before = Date.now()
    const res = await markMessagesReadEndpoint.handler(req as never)
    expect(await res.json()).toEqual({ ok: true, updated: 1 })
    expect(update).toHaveBeenCalledExactlyOnceWith({
      collection: 'messages',
      where: {
        and: [
          { recipient: { equals: 7 } },
          { id: { in: [10, 11] } },
          { readAt: { exists: false } },
        ],
      },
      data: { readAt: expect.any(String) },
      overrideAccess: true,
      req,
    })
    const timestamp = Date.parse(update.mock.calls[0][0].data.readAt)
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(Date.now())
  })
})
