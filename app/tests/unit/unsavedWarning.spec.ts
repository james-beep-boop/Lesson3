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
} from '../../src/components/EditRecovery/unsavedWarning.js'

describe('unsavedWarningText', () => {
  const tail = 'unsaved changes on this version. Deleting it discards them.'

  it('says nothing when nobody would lose anything', () => {
    expect(unsavedWarningText({ otherUsers: 0, includesCaller: false })).toBe('')
  })

  it.each([
    [{ otherUsers: 1, includesCaller: false }, `1 other person has ${tail}`],
    [{ otherUsers: 3, includesCaller: false }, `3 other people have ${tail}`],
    [{ otherUsers: 0, includesCaller: true }, `You have ${tail}`],
    [{ otherUsers: 1, includesCaller: true }, `You and 1 other person have ${tail}`],
    [{ otherUsers: 2, includesCaller: true }, `You and 2 other people have ${tail}`],
  ])('%o → the right sentence', (counts, expected) => {
    expect(unsavedWarningText(counts)).toBe(expected)
  })

  it("ignores the caller's own work when told to (Save retires it anyway)", () => {
    expect(unsavedWarningText({ otherUsers: 0, includesCaller: true }, false)).toBe('')
    expect(unsavedWarningText({ otherUsers: 2, includesCaller: true }, false)).toBe(
      `2 other people have ${tail}`,
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
