/**
 * `findReadable*` (`lib/readBundle.ts`) — the rule that separates "you cannot see it" from
 * "something is broken".
 *
 * WHY THIS EXISTS NOW. These helpers were written with the distinction spelled out in their
 * docblock and pinned by nothing, and the gap showed: `collections/Messages.ts` was doing the same
 * lookup with a bare `.catch(() => null)`, so a database outage was reported to the client as
 * `400 A linked lesson version must belong to the linked lesson plan` — a confident, specific,
 * WRONG diagnosis that also skipped the 500 path and the error tracker. That call site now uses
 * `findReadableVersion`, which makes this contract load-bearing for a second module, so it gets a
 * test rather than a comment.
 *
 * ⚑ THE ASYMMETRY IS THE WHOLE POINT. Returning null too eagerly turns infrastructure faults into
 * plausible-looking domain answers; rethrowing too eagerly turns an ordinary permission denial into
 * a 500. Only Payload's 404 and 403 mean "not visible to this caller".
 *
 * Fully faked `payload` — no DB, no Payload boot → runs in `test:unit`.
 */
import { describe, expect, it, vi } from 'vitest'

import { findReadablePlan, findReadableVersion } from '../../src/lib/readBundle.js'

/** A payload stub whose `findByID` rejects with the given value. */
const rejectingPayload = (err: unknown) =>
  ({ findByID: vi.fn().mockRejectedValue(err) }) as never

/** A payload stub that resolves a document. */
const resolvingPayload = (doc: unknown) =>
  ({ findByID: vi.fn().mockResolvedValue(doc) }) as never

const args = { id: 7, user: null }

describe('not-visible answers become null', () => {
  it.each([404, 403])('a Payload %i resolves to null, not a throw', async (status) => {
    await expect(findReadableVersion(rejectingPayload({ status }), args)).resolves.toBeNull()
    await expect(findReadablePlan(rejectingPayload({ status }), args)).resolves.toBeNull()
  })

  it('a found document is returned unchanged', async () => {
    const doc = { id: 7, semver: '1.0.0' }
    await expect(findReadableVersion(resolvingPayload(doc), args)).resolves.toBe(doc)
  })
})

describe('operational failures propagate', () => {
  /**
   * ⚑ THE CASE THE MESSAGES BUG WAS. Each of these used to be laundered into "not visible" by a
   * bare catch at the call site, and the caller then reported its own domain error with total
   * confidence. A 500 here is the correct, honest answer.
   */
  it.each([
    ['a 500 from Payload', { status: 500, message: 'internal' }],
    ['a database driver fault', Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' })],
    ['a plain runtime error with no status at all', new TypeError('undefined is not a function')],
    ['a 400', { status: 400 }],
    ['a 401 — unauthenticated is not the same as not-visible', { status: 401 }],
  ])('%s is rethrown', async (_label, err) => {
    await expect(findReadableVersion(rejectingPayload(err), args)).rejects.toBeDefined()
    await expect(findReadablePlan(rejectingPayload(err), args)).rejects.toBeDefined()
  })

  it('rethrows the ORIGINAL error, so the tracker sees the real cause', async () => {
    const original = new Error('connection terminated unexpectedly')
    await expect(findReadableVersion(rejectingPayload(original), args)).rejects.toBe(original)
  })
})
