/**
 * Unit coverage for the edit-recovery request-body guards (`src/endpoints/recoveryParse.ts`).
 *
 * ⚑ Two of these pin fixes that shipped WITHOUT regression coverage, which is why they exist as unit
 * tests rather than waiting for the wire suite: the guards are pure HTTP semantics, so they can be
 * proven today, in the DB-free environment, instead of only once the compose app image serves
 * requests again.
 *
 *   - `requireDocument` is the fix for a malformed `document` erasing a good backup. The wire suite
 *     owns the other half — that the PRIOR capture survives the rejection — because only a real
 *     request against a real row can show that.
 *   - `readRecoveryBody`'s pre-parse guard is the raw-body ceiling. The assertion that matters is not
 *     the 413; it is that the body was never read.
 *
 * Mirrors `parsePreviewCandidate.spec.ts`, the house pattern for endpoint body guards.
 */
import { describe, it, expect, vi } from 'vitest'

// Stub `payload` so importing the parser does NOT pull the heavy payload barrel into the DB-free
// unit env. The parser only needs APIError to carry a `status`; this mirrors Payload's APIError.
vi.mock('payload', () => ({
  APIError: class extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

import {
  MAX_RECOVERY_BODY_BYTES,
  readRecoveryBody,
  requireCounter,
  requireDocument,
} from '../../src/endpoints/recoveryParse.js'

/** The status an APIError carries, or `undefined` when the call resolved. */
const statusOf = async (run: () => unknown): Promise<number | undefined> => {
  try {
    await run()
    return undefined
  } catch (e) {
    return (e as { status?: number }).status
  }
}

/** A fake PayloadRequest with an optional Content-Length and a JSON body. */
const reqWith = (json: () => Promise<unknown>, contentLength?: number) =>
  ({
    headers: {
      get: (k: string) =>
        k === 'content-length' && contentLength != null ? String(contentLength) : null,
    },
    json,
  }) as never

describe('readRecoveryBody — the raw-body ceiling', () => {
  it('413 when Content-Length exceeds the cap, WITHOUT reading the body', async () => {
    let read = false
    const req = reqWith(async () => {
      read = true
      return {}
    }, MAX_RECOVERY_BODY_BYTES + 1)

    expect(await statusOf(() => readRecoveryBody(req))).toBe(413)
    // The whole point. A 413 returned after `req.json()` had already materialised the body would
    // have cost exactly the memory the guard exists to refuse.
    expect(read, 'the body must never be read once the header disqualifies it').toBe(false)
  })

  it('a body exactly AT the cap is allowed through', async () => {
    const req = reqWith(async () => ({ ok: true }), MAX_RECOVERY_BODY_BYTES)
    await expect(readRecoveryBody(req)).resolves.toEqual({ ok: true })
  })

  it('parses normally when the header is absent — the guard is not a requirement to declare a length', async () => {
    const req = reqWith(async () => ({ generation: 1 }))
    await expect(readRecoveryBody(req)).resolves.toEqual({ generation: 1 })
  })

  it('an absent body is {}, not an error — `start` legitimately posts nothing', async () => {
    const req = reqWith(async () => undefined)
    await expect(readRecoveryBody(req)).resolves.toEqual({})
  })

  it('400 on a body that is not JSON', async () => {
    const req = reqWith(async () => {
      throw new SyntaxError('Unexpected token')
    })
    expect(await statusOf(() => readRecoveryBody(req))).toBe(400)
  })
})

/**
 * ⚑ The regression guard for the fix in `206252a`. Every one of these values previously projected to
 * `{}` and the capture SUCCEEDED — advancing the revision and replacing captured prose with nothing.
 */
describe('requireDocument — a malformed document must never reach the projection', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['a string', '{"lessons":[]}'],
    ['an array', [{ id: 'L1' }]],
    ['a number', 0],
    ['a boolean', false],
  ])('400 when `document` is %s', async (_label, value) => {
    expect(await statusOf(() => requireDocument(value))).toBe(400)
  })

  it('an EMPTY object is still valid — a teacher who cleared every field', () => {
    expect(requireDocument({})).toEqual({})
  })

  it('passes a plain object through unchanged', () => {
    const doc = { lessons: [{ id: 'L1', title: 'still typing' }] }
    expect(requireDocument(doc)).toBe(doc)
  })
})

describe('requireCounter — token fields are rejected, never coerced', () => {
  it.each([
    ['a boolean', true], // Number(true) === 1 would pass a laxer check
    ['null', null],
    ['zero', 0],
    ['a negative', -1],
    ['a fraction', 1.5],
    ['a non-numeric string', 'abc'],
    ['an empty string', ''], // Number('') === 0
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 2],
  ])('400 when the value is %s', async (_label, value) => {
    expect(await statusOf(() => requireCounter(value, 'generation'))).toBe(400)
  })

  it('accepts a positive integer, and a numeric string of one', () => {
    expect(requireCounter(3, 'generation')).toBe(3)
    expect(requireCounter('3', 'generation')).toBe(3)
  })

  it('names the offending field, so a client can tell which token half was wrong', async () => {
    try {
      requireCounter(0, 'expectedRevision')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('expectedRevision')
    }
  })
})
