/**
 * The fail-closed flag reader (`src/lib/systemFlags.ts`).
 *
 * ⚑ THE LOAD-BEARING CASES are the failures: a read that throws, and a document without the value,
 * must both read as OFF and be LOGGED, or a database fault is indistinguishable from
 * an operator's deliberate off (`docs/DESIGN-system-panel-2026-08-21.md`, "Reads"). The happy path
 * alone would pass against a reader that defaulted to on.
 *
 * DB-free: `readSystemFlags` takes a Payload instance, and a fake one is enough to drive every branch.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Payload, PayloadRequest } from 'payload'

import { isForumEnabled, readSystemFlags } from '../../src/lib/systemFlags.js'

const fakePayload = (findGlobal: () => Promise<unknown>) => {
  const error = vi.fn()
  return { payload: { findGlobal, logger: { error } } as unknown as Payload, error }
}

describe('readSystemFlags', () => {
  it('reads an explicit true as on and an explicit false as off', async () => {
    const { payload, error } = fakePayload(async () => ({
      features: { forumEnabled: true, publicLibraryLive: false },
    }))
    expect(await readSystemFlags(payload)).toEqual({ forumEnabled: true, publicLibraryLive: false })
    expect(error).not.toHaveBeenCalled()
  })

  it('fails closed on a missing document, group or value — and on anything but true', async () => {
    for (const doc of [
      {},
      { features: null },
      { features: {} },
      { features: { forumEnabled: null } },
      { features: { forumEnabled: 'true' } },
    ]) {
      const { payload, error } = fakePayload(async () => doc)
      expect((await readSystemFlags(payload)).forumEnabled, JSON.stringify(doc)).toBe(false)
      expect(error).toHaveBeenCalledTimes(1)
      expect(error.mock.calls[0][0]).toMatchObject({
        event: 'system_settings_invalid_flags',
        flags: expect.arrayContaining(['forumEnabled']),
      })
    }
  })

  it('reports only malformed flags and preserves the other stored values', async () => {
    const { payload, error } = fakePayload(async () => ({
      features: { forumEnabled: true, publicLibraryLive: 'false' },
    }))
    expect(await readSystemFlags(payload)).toEqual({ forumEnabled: true, publicLibraryLive: false })
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][0]).toEqual({
      event: 'system_settings_invalid_flags',
      flags: ['publicLibraryLive'],
    })
  })

  it('fails closed on a read error, and logs it as a structured error', async () => {
    const { payload, error } = fakePayload(async () => {
      throw new Error('connection refused')
    })
    expect(await readSystemFlags(payload)).toEqual({
      forumEnabled: false,
      publicLibraryLive: false,
    })
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][0]).toMatchObject({ event: 'system_settings_read_failed' })
  })
})

describe('isForumEnabled', () => {
  it('reads once per request, however many checks ask', async () => {
    const findGlobal = vi.fn(async () => ({
      features: { forumEnabled: true, publicLibraryLive: false },
    }))
    const { payload } = fakePayload(findGlobal)
    const req = { payload, context: {} } as unknown as PayloadRequest

    const answers = await Promise.all([
      isForumEnabled(req),
      isForumEnabled(req),
      isForumEnabled(req),
    ])
    expect(answers).toEqual([true, true, true])
    expect(findGlobal).toHaveBeenCalledTimes(1)
  })

  it('does not carry an answer from one request to the next', async () => {
    let stored = true
    const findGlobal = vi.fn(async () => ({
      features: { forumEnabled: stored, publicLibraryLive: false },
    }))
    const { payload } = fakePayload(findGlobal)

    expect(await isForumEnabled({ payload, context: {} } as unknown as PayloadRequest)).toBe(true)
    stored = false // the operator switches it off between requests
    expect(await isForumEnabled({ payload, context: {} } as unknown as PayloadRequest)).toBe(false)
    expect(findGlobal).toHaveBeenCalledTimes(2)
  })
})
