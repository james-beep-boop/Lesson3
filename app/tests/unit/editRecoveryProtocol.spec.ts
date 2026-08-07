/**
 * The edit-recovery CLIENT protocol decisions (`components/EditRecovery/protocol.ts`).
 *
 * ⚑ These are unit tests and not Playwright cases on purpose. What is being pinned is a set of
 * BRANCHES — which HTTP outcome means the server committed, and which token a save may therefore
 * send — and a browser test exercises one branch per run at enormous cost while proving nothing about
 * the others. The Playwright cases assert the user-visible consequences; this file asserts the
 * reasoning that produces them.
 *
 * The branch that matters most is `definite` vs `indeterminate`. It is invisible in the UI, it is the
 * one the first version of the design got wrong, and getting it wrong produces a 409 on a save the
 * user was told would proceed.
 */
import { describe, it, expect } from 'vitest'

import {
  classifyResponse,
  fingerprint,
  planSave,
  statusForOutcome,
  type CaptureOutcome,
  type RecoveryToken,
} from '../../src/components/EditRecovery/protocol.js'

const token = (revision: number): RecoveryToken => ({
  generation: 1,
  revision,
  updatedAt: '2026-08-07T00:00:00.000Z',
})

describe('classifyResponse — what the server actually did', () => {
  it('200 with a token is a commit, and carries the ADVANCED token', () => {
    const out = classifyResponse(200, { token: token(4) }, null)
    expect(out).toEqual({ kind: 'ok', token: token(4) })
  })

  it('409 is a conflict — someone else holds newer work', () => {
    expect(classifyResponse(409, null, null)).toEqual({ kind: 'conflict' })
  })

  it('413 is definite: the server refused before storing anything', () => {
    expect(classifyResponse(413, null, null)).toEqual({ kind: 'definite', reason: 'tooLarge' })
  })

  it('429 is definite and carries the Retry-After the limiter sent', () => {
    expect(classifyResponse(429, null, '17')).toEqual({
      kind: 'definite',
      reason: 'rateLimited',
      retryAfterSec: 17,
    })
  })

  /**
   * ⚑ A missing or junk `Retry-After` must not reach `setTimeout` as `NaN`, which fires IMMEDIATELY —
   * turning backoff into a hot loop against a limiter that is already refusing us.
   */
  it.each([
    ['absent', null],
    ['empty', ''],
    ['non-numeric', 'later'],
    ['zero', '0'],
    ['negative', '-5'],
  ])('429 with a %s Retry-After falls back to a real delay', (_label, header) => {
    const out = classifyResponse(429, null, header)
    expect(out.kind).toBe('definite')
    if (out.kind !== 'definite') return
    expect(Number.isFinite(out.retryAfterSec)).toBe(true)
    expect(out.retryAfterSec).toBeGreaterThan(0)
  })

  /**
   * ⚑ THE ASYMMETRY THIS FILE EXISTS FOR. 4xx is the server declining before it acted, so nothing was
   * written. 5xx may be a failure AFTER the write committed — a crash while serialising the response,
   * a proxy timeout — so the client cannot conclude it did not land.
   */
  it.each([[500], [502], [503], [504]])(
    '%d is INDETERMINATE, not a definite rejection',
    (status) => {
      expect(classifyResponse(status, null, null)).toEqual({ kind: 'indeterminate' })
    },
  )

  it.each([[400], [401], [403], [404]])(
    '%d is definite — the server declined before acting',
    (status) => {
      expect(classifyResponse(status, null, null)).toEqual({ kind: 'definite', reason: 'rejected' })
    },
  )

  it('a 200 with NO token is indeterminate, not a success', () => {
    // Adopting `undefined` as a token would fence this session out of its own row on the next write.
    expect(classifyResponse(200, {}, null)).toEqual({ kind: 'indeterminate' })
    expect(classifyResponse(200, null, null)).toEqual({ kind: 'indeterminate' })
  })
})

describe('planSave — which token the save may send', () => {
  const held = token(3)

  it('a committed capture saves with the ADVANCED token, not the one it sent', () => {
    expect(planSave({ kind: 'ok', token: token(4) }, held)).toEqual({
      proceed: true,
      token: token(4),
    })
  })

  /** The save must not proceed: another tab holds newer work and saving on would retire it. */
  it('a conflict STOPS the save', () => {
    expect(planSave({ kind: 'conflict' }, held)).toEqual({ proceed: false, reason: 'conflict' })
  })

  /**
   * ⚑ The version save is the operation that matters; the capture is insurance. Blocking a real save
   * because its insurance failed inverts the priority exactly.
   */
  it.each<[string, CaptureOutcome]>([
    ['too large', { kind: 'definite', reason: 'tooLarge' }],
    ['rate limited', { kind: 'definite', reason: 'rateLimited', retryAfterSec: 12 }],
    ['rejected', { kind: 'definite', reason: 'rejected' }],
  ])(
    'a %s flush still saves, keeping the held token (the server did not commit)',
    (_l, outcome) => {
      expect(planSave(outcome, held)).toEqual({ proceed: true, token: held })
    },
  )

  /**
   * ⚑ THE CORRECTION. A network failure can land AFTER the server committed: the capture advanced the
   * revision, the response was lost, and the held token is now stale. Sending it would 409 the save —
   * contradicting "transport failure ⇒ save anyway" in the one case that looks identical to the user.
   * Saving with NO token takes the path the server already supports and leaves the row for expiry.
   */
  it('an INDETERMINATE flush saves with NO token at all, whatever it is holding', () => {
    expect(planSave({ kind: 'indeterminate' }, held)).toEqual({ proceed: true, token: null })
    // The held token is ignored entirely — including one that looks perfectly current.
    expect(planSave({ kind: 'indeterminate' }, token(99))).toEqual({ proceed: true, token: null })
  })
})

describe('statusForOutcome — what the user is told', () => {
  it('surfaces the rate-limit delay so backoff is visible (matrix case 13)', () => {
    expect(statusForOutcome({ kind: 'definite', reason: 'rateLimited', retryAfterSec: 9 })).toEqual(
      { kind: 'notBackedUp', reason: 'rateLimited', retryAfterSec: 9 },
    )
  })

  it('distinguishes too-large from ordinary transport failure', () => {
    expect(statusForOutcome({ kind: 'definite', reason: 'tooLarge' })).toEqual({
      kind: 'notBackedUp',
      reason: 'tooLarge',
    })
    expect(statusForOutcome({ kind: 'indeterminate' })).toEqual({
      kind: 'notBackedUp',
      reason: 'transport',
    })
    // A bare rejection reads as transport too — the user cannot act on a 4xx they did not cause.
    expect(statusForOutcome({ kind: 'definite', reason: 'rejected' })).toEqual({
      kind: 'notBackedUp',
      reason: 'transport',
    })
  })

  it('a successful capture is the ONLY thing that reports backedUp', () => {
    // SPEC §5: the timestamp IS the contract, so no failure may wear it.
    expect(statusForOutcome({ kind: 'ok', token: token(2) }).kind).toBe('backedUp')
  })

  it('a conflict is its own state, not a generic failure', () => {
    // It needs different UI: the user must be able to see and copy the other tab's newer work.
    expect(statusForOutcome({ kind: 'conflict' })).toEqual({ kind: 'conflict' })
  })
})

describe('fingerprint — so an oversized payload is not resent unchanged', () => {
  it('is stable for identical content and differs for changed content', () => {
    const a = JSON.stringify({ document: { lessons: [{ id: 'L1', overview: 'x'.repeat(500) }] } })
    const b = JSON.stringify({ document: { lessons: [{ id: 'L1', overview: 'x'.repeat(501) }] } })
    expect(fingerprint(a)).toBe(fingerprint(a))
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })

  it('notices a change in the middle of a large payload', () => {
    // The realistic case: one edited character inside a long prose field. Length-only comparison
    // would call these identical and suppress a capture the user is owed.
    const big = 'a'.repeat(100_000)
    const edited = `${big.slice(0, 50_000)}Z${big.slice(50_001)}`
    expect(edited.length).toBe(big.length)
    expect(fingerprint(edited)).not.toBe(fingerprint(big))
  })

  it('handles an empty payload without throwing', () => {
    expect(typeof fingerprint('')).toBe('string')
  })
})
