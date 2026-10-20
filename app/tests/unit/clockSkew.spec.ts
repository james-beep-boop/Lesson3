/** The wrong-clock comparison (2026-10-19, `lib/clockSkew.ts`). */
import { describe, expect, it } from 'vitest'

import { CLOCK_TOLERANCE_MS, clocksDisagree } from '../../src/lib/clockSkew'

const at = (iso: string) => Date.parse(iso)

describe('clocksDisagree', () => {
  it('a different time zone alone is never a disagreement — the same instant is the same instant', () => {
    // 09:00 in Nairobi (UTC+3) and 06:00 UTC are one moment; the screens show different hours.
    expect(clocksDisagree(at('2026-10-19T09:00:00+03:00'), at('2026-10-19T06:00:00Z'))).toBe(false)
    expect(clocksDisagree(at('2026-10-19T00:30:00-07:00'), at('2026-10-19T07:30:00Z'))).toBe(false)
  })

  it('tolerates small differences and flags large ones in either direction', () => {
    const device = at('2026-10-19T12:00:00Z')
    expect(clocksDisagree(device + 5 * 60_000, device)).toBe(false)
    expect(clocksDisagree(device + CLOCK_TOLERANCE_MS, device)).toBe(false)
    expect(clocksDisagree(device + CLOCK_TOLERANCE_MS + 1, device)).toBe(true)
    expect(clocksDisagree(at('2000-01-01T00:00:00Z'), device)).toBe(true) // reset after a power cut
    expect(clocksDisagree(at('2031-03-01T00:00:00Z'), device)).toBe(true) // jumped forward
  })

  it('never flags on a reading it cannot interpret', () => {
    expect(clocksDisagree(Number.NaN, Date.now())).toBe(false)
    expect(clocksDisagree(Date.now(), Number.POSITIVE_INFINITY)).toBe(false)
  })
})
