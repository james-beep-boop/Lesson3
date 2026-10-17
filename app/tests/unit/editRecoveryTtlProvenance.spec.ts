/**
 * The pure halves of "Keep for later" (SPEC §5, 2026-10-17): the retention arithmetic both the
 * expiry pass and the kept-until date use, and the one restorability predicate the restore prompt
 * and Manage's list share.
 */
import { describe, expect, it } from 'vitest'

import {
  CAPTURE_TTL_DAYS,
  captureExpiryCutoff,
  captureKeptUntil,
} from '../../src/lib/editRecovery/ttl.js'
import { CAPTURE_SCHEMA_VERSION, captureProvenance } from '../../src/lib/editRecovery/provenance.js'

const DAY = 86_400_000

describe('retention', () => {
  it('a capture is kept for the TTL after its last write', () => {
    const at = '2026-10-17T09:00:00.000Z'
    expect(captureKeptUntil(at).getTime() - Date.parse(at)).toBe(CAPTURE_TTL_DAYS * DAY)
  })

  it('the expiry cutoff is the same distance in the other direction', () => {
    const now = Date.parse('2026-11-16T09:00:00.000Z')
    // A capture written exactly at the cutoff is "kept until" now — the two sides agree.
    expect(captureKeptUntil(captureExpiryCutoff(now)).getTime()).toBe(now)
  })
})

describe('captureProvenance', () => {
  const base = '2026-10-01T12:00:00.123Z'

  it('a capture against the current source, in the current shape, may be applied', () => {
    expect(
      captureProvenance({ baseUpdatedAt: base, schemaVersion: CAPTURE_SCHEMA_VERSION }, base),
    ).toEqual({ stale: false, schemaMismatch: false })
  })

  it('normalises the source timestamp however the driver hands it over', () => {
    expect(
      captureProvenance(
        { baseUpdatedAt: base, schemaVersion: CAPTURE_SCHEMA_VERSION },
        new Date(base),
      ).stale,
    ).toBe(false)
  })

  it('a moved source is stale; a different shape is a mismatch', () => {
    expect(
      captureProvenance({ baseUpdatedAt: base, schemaVersion: 'v0' }, '2026-10-02T00:00:00.000Z'),
    ).toEqual({ stale: true, schemaMismatch: true })
  })
})
