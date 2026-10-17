/**
 * The delete confirmations' unsaved-work warning (SPEC §5, "Keep for later", 2026-10-17).
 *
 * Two properties: the sentence is right for every count, and the lookup FAILS OPEN — a refused or
 * broken request leaves the confirmation exactly as it was, because the warning is advisory and the
 * delete endpoint is the authority.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  unsavedWarningText,
  unsavedWorkWarning,
  WARNING_TIMEOUT_MS,
} from '../../src/components/EditRecovery/unsavedWarning.js'

describe('unsavedWarningText', () => {
  const one = 'a draft based on this version. Deleting it discards it.'
  const many = 'drafts based on this version. Deleting it discards them.'

  it('says nothing when nobody would lose anything', () => {
    expect(unsavedWarningText({ otherUsers: 0, includesCaller: false })).toBe('')
  })

  it.each([
    [{ otherUsers: 1, includesCaller: false }, `1 other person has ${one}`],
    [{ otherUsers: 3, includesCaller: false }, `3 other people have ${many}`],
    [{ otherUsers: 0, includesCaller: true }, `You have ${one}`],
    [{ otherUsers: 1, includesCaller: true }, `You and 1 other person have ${many}`],
    [{ otherUsers: 2, includesCaller: true }, `You and 2 other people have ${many}`],
  ])('%o → the right sentence', (counts, expected) => {
    expect(unsavedWarningText(counts)).toBe(expected)
  })

  it("ignores the caller's own work when told to (Save retires it anyway)", () => {
    expect(unsavedWarningText({ otherUsers: 0, includesCaller: true }, false)).toBe('')
    expect(unsavedWarningText({ otherUsers: 2, includesCaller: true }, false)).toBe(
      `2 other people have ${many}`,
    )
  })
})

describe('unsavedWorkWarning fails open', () => {
  afterEach(() => vi.unstubAllGlobals())

  const respond = (status: number, body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    )

  it('asks the version-scoped endpoint and returns the sentence', async () => {
    respond(200, { otherUsers: 1, includesCaller: false })
    expect(await unsavedWorkWarning(42)).toMatch(/^1 other person has/)
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      '/api/lesson-bundle-versions/42/recovery/unsaved-count',
    )
  })

  it.each([403, 404, 500])('a %i leaves the confirmation unchanged', async (status) => {
    respond(status, { errors: [{ message: 'no' }] })
    expect(await unsavedWorkWarning(42)).toBe('')
  })

  it('a malformed body leaves the confirmation unchanged', async () => {
    respond(200, { otherUsers: 'lots' })
    expect(await unsavedWorkWarning(42)).toBe('')
  })

  it('a network error leaves the confirmation unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    expect(await unsavedWorkWarning(42)).toBe('')
  })
})

/**
 * ⚑ THE LOOKUP IS BOUNDED (audit 2026-10-17). Save awaits it with the form locked, so a request that
 * never answered held the editor on "Saving…" indefinitely. Both halves of a response can stall —
 * the headers, and the body after them — and both must give up.
 */
describe('unsavedWorkWarning gives up after a deadline', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('a request that never answers resolves to no warning, and is aborted', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    // Ignores the abort on purpose: the deadline must not depend on the request honouring it.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>(() => {})
      }),
    )
    const pending = unsavedWorkWarning(42)
    await vi.advanceTimersByTimeAsync(WARNING_TIMEOUT_MS)
    expect(await pending).toBe('')
    expect(signal?.aborted, 'the abandoned request is released').toBe(true)
  })

  it('a body that never arrives resolves to no warning', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) }) as unknown as Response),
    )
    const pending = unsavedWorkWarning(42)
    await vi.advanceTimersByTimeAsync(WARNING_TIMEOUT_MS)
    expect(await pending).toBe('')
  })
})
