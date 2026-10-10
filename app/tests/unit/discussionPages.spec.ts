/**
 * The thread loader's error handling (`src/lib/discussionPages.ts` `loadThread`).
 *
 * ⚑ THE LOAD-BEARING CASE (GPT review 2026-10-11): only "not there" (404) and "not yours to see" (403)
 * become the page's 404. A database or programming failure must propagate, not masquerade as a missing
 * discussion — the `readBundle` convention (`nullOnNotVisible`).
 */
import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { loadThread } from '../../src/lib/discussionPages.js'
import type { User } from '../../src/payload-types.js'

const user = { id: 7, roles: [] } as unknown as User

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
})
