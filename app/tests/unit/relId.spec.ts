/**
 * `relId` (`src/lib/relId.ts`) — the numeric id of a relationship value.
 *
 * ⚑ THE LOAD-BEARING CASE is the digit string: Payload hands a REST body's `"12"` to collection hooks
 * unconverted, and reading it as null silently dropped a reference a client really sent (discussions
 * 3a review, 2026-10-09).
 */
import { describe, expect, it } from 'vitest'

import { relId } from '../../src/lib/relId.js'

describe('relId', () => {
  it('reads numbers, digit strings and populated objects — up to the integer id range', () => {
    expect(relId(2_147_483_647)).toBe(2_147_483_647)
    expect(relId('2147483647')).toBe(2_147_483_647)
    expect(relId(12)).toBe(12)
    expect(relId('12')).toBe(12)
    expect(relId({ id: 12 })).toBe(12)
    expect(relId({ id: '12' })).toBe(12)
  })

  it('is null for anything that is not an id', () => {
    for (const value of [
      null,
      undefined,
      '',
      ' 12 ',
      '1e1',
      '0x0c',
      '-3',
      '1.5',
      'abc',
      {},
      { id: 'x' },
      [],
      // Numbers that are not ids, and digit strings that do not convert to one.
      Number.NaN,
      Infinity,
      -Infinity,
      1.5,
      0,
      -3,
      2_147_483_648,
      '2147483648',
      '9'.repeat(400),
      { id: Infinity },
    ]) {
      expect(relId(value), JSON.stringify(value)).toBeNull()
    }
  })
})
