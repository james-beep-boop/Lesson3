/**
 * The thread loader's error handling (`src/lib/discussionPages.ts` `loadThread`).
 *
 * ⚑ THE LOAD-BEARING CASE (GPT review 2026-10-11): only "not there" (404) and "not yours to see" (403)
 * become the page's 404. A database or programming failure must propagate, not masquerade as a missing
 * discussion — the `readBundle` convention (`nullOnNotVisible`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { loadThread, requireForum } from '../../src/lib/discussionPages.js'
import type { User } from '../../src/payload-types.js'

const user = { id: 7, roles: [] } as unknown as User
const flags = vi.hoisted(() => ({ forumEnabled: true }))
vi.mock('../../src/lib/systemFlags', () => ({ systemFlagsForRender: async () => flags }))
beforeEach(() => {
  flags.forumEnabled = true
})

const payloadWhoseTopicRead = (failure: unknown) =>
  ({
    findByID: vi.fn(async () => {
      throw failure
    }),
    find: vi.fn(async () => ({ docs: [] })),
  }) as unknown as Payload

describe('loadThread', () => {
  it.each([404, 403])('turns a %s into the page’s not-found', async (status) => {
    const failure = Object.assign(new Error('nope'), { status })
    await expect(
      loadThread(payloadWhoseTopicRead(failure), user, 1, undefined),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    })
  })

  it('lets a real failure through', async () => {
    const failure = new Error('connection terminated unexpectedly')
    await expect(loadThread(payloadWhoseTopicRead(failure), user, 1, undefined)).rejects.toBe(
      failure,
    )
  })

  it('moderation while off skips the inaccessible participation read', async () => {
    const find = vi.fn(async () => {
      throw new Error('No participation read allowed')
    })
    const payload = {
      findByID: async () => ({ id: 1, title: 'Topic', body: 'Text', lastSeq: 0 }),
      find,
    } as unknown as Payload
    const result = await loadThread(payload, user, 1, undefined, false)
    expect(result.lastReadSeq).toBeNull()
    expect(result.page).toBe(1)
    expect(find).not.toHaveBeenCalled()
  })
})

describe('forum page gate', () => {
  const payload = {} as Payload
  const admin = { ...user, roles: ['siteAdmin'] } as User

  it('permits a signed-in read while on', async () => {
    expect(await requireForum(payload, user)).toBe(true)
  })

  it('refuses ordinary users while off', async () => {
    flags.forumEnabled = false
    await expect(requireForum(payload, user)).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    })
  })

  it('admits only the administrator moderation view while off', async () => {
    flags.forumEnabled = false
    expect(await requireForum(payload, admin)).toBe(false)
    // /discuss/new never supplies the moderation exception.
    await expect(requireForum(payload)).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    })
  })
})
