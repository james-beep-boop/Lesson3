/**
 * The short reset code's pure parts (`lib/resetCode.ts`): what we issue, what we accept as typed,
 * and that only a keyed hash bound to the account is ever compared.
 */
import { describe, expect, it } from 'vitest'

import { hashResetCode, newResetCode, normalizeResetCode, resetCodeMatches } from '@/lib/resetCode'

describe('newResetCode', () => {
  it('issues XXXX-XXXX from an alphabet with no look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const code = newResetCode()
      expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/)
      expect(code).not.toMatch(/[01ILOU]/)
    }
  })

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 1000 }, newResetCode))
    expect(codes.size).toBe(1000)
  })
})

describe('normalizeResetCode', () => {
  it.each([
    ['K7QM-3XPA', 'K7QM3XPA'],
    ['k7qm3xpa', 'K7QM3XPA'],
    [' K7QM 3XPA ', 'K7QM3XPA'],
  ])('accepts %j as %s', (typed, canonical) => {
    expect(normalizeResetCode(typed)).toBe(canonical)
  })

  it.each(['K7QM-3XP', 'K7QM-3XPAA', 'K7QM-3XP0', 'K7QM-3XPI', 'K7QM_3XPA', ''])(
    'refuses %j',
    (typed) => {
      expect(normalizeResetCode(typed)).toBeNull()
    },
  )
})

describe('resetCodeMatches', () => {
  const stored = hashResetCode('secret', 7, 'K7QM3XPA')

  it('matches the same code for the same account', () => {
    expect(resetCodeMatches('secret', 7, 'K7QM3XPA', stored)).toBe(true)
  })

  it('does not match another account, another secret, or another code', () => {
    expect(resetCodeMatches('secret', 8, 'K7QM3XPA', stored)).toBe(false)
    expect(resetCodeMatches('other', 7, 'K7QM3XPA', stored)).toBe(false)
    expect(resetCodeMatches('secret', 7, 'K7QM3XPB', stored)).toBe(false)
  })

  it('stores no trace of the code itself', () => {
    expect(stored).not.toContain('K7QM')
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
  })
})
