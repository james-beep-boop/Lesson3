/**
 * Pins the app-wide version-list order (DECISIONS 2026-07-06): the Official first, then
 * most-recent → oldest — the VersionsPanel and every human-facing version list rely on it.
 */
import { describe, expect, it } from 'vitest'

import { sortVersionsOfficialFirst } from '../../src/lib/versionsOrder.js'

const v = (id: number, createdAt: string) => ({ id, createdAt })

describe('sortVersionsOfficialFirst', () => {
  it('pins the Official first even when it is the oldest', () => {
    const versions = [v(1, '2026-01-01'), v(2, '2026-02-01'), v(3, '2026-03-01')]
    expect(sortVersionsOfficialFirst(versions, 1).map((x) => x.id)).toEqual([1, 3, 2])
  })

  it('orders the rest newest → oldest', () => {
    const versions = [v(4, '2026-01-04'), v(2, '2026-01-02'), v(3, '2026-01-03')]
    expect(sortVersionsOfficialFirst(versions, null).map((x) => x.id)).toEqual([4, 3, 2])
  })

  it('tolerates string/number id mismatch and missing dates', () => {
    const versions = [
      { id: '7', createdAt: null },
      { id: 8, createdAt: '2026-01-08' },
    ]
    expect(sortVersionsOfficialFirst(versions, 7).map((x) => String(x.id))).toEqual(['7', '8'])
  })

  it('does not mutate its input', () => {
    const versions = [v(1, '2026-01-01'), v(2, '2026-02-01')]
    const copy = [...versions]
    sortVersionsOfficialFirst(versions, 2)
    expect(versions).toEqual(copy)
  })
})
