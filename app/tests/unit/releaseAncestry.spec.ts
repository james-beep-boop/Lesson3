import { describe, expect, it } from 'vitest'

import {
  auditReleaseAncestry,
  latestRelease,
  type ReleaseRow,
} from '../../src/ingest/releaseAncestry.js'
import { MAX_LINEAGE } from '../../src/lib/combine/lineage.js'

const release = (id: number, semver: string, rest: Partial<ReleaseRow> = {}): ReleaseRow => ({
  id,
  semver,
  source: null,
  author: null,
  substrandId: '10.1',
  ...rest,
})

describe('ingested release ancestry', () => {
  it('chooses numeric major, not a teacher patch, deleted author, clock or Official', () => {
    const rows = [
      release(1, '2.0.0'),
      release(2, '10.0.0'),
      release(3, '10.0.9'),
      release(4, '11.0.0', { author: 1 }),
      release(5, '12.0.0', { second: 1 }),
      release(6, '13.0.0', { substrandId: 'elsewhere' }),
    ]
    expect(latestRelease(rows, '10.1')?.id).toBe(2)
    expect(latestRelease(rows.reverse(), '10.1')?.id).toBe(2)
    expect(latestRelease([], '10.1')).toBeNull()
  })

  it('audits unordered legacy releases, repairs descendant closure and is idempotent', () => {
    const rows = [
      release(4, '3.0.1', { source: 3, lineage: [3, 99] }),
      release(3, '3.0.0'),
      release(1, '1.0.0'),
      release(2, '2.0.0'),
    ]
    const result = auditReleaseAncestry(rows)
    expect([...result.parents]).toEqual([
      [3, 2],
      [2, 1],
    ])
    expect(result.lineage.get(4)).toEqual([1, 2, 3, 99])
    expect(result.skipped).toEqual([])
    expect(
      auditReleaseAncestry(
        rows.map((r) => ({
          ...r,
          source: result.parents.get(r.id) ?? r.source,
          lineage: result.lineage.get(r.id),
        })),
      ).parents.size,
    ).toBe(0)
  })

  it('reports missing, ambiguous or already recorded ancestry and leaves existing links alone', () => {
    const rows = [
      release(1, '1.0.0'),
      release(3, '3.0.0'),
      release(4, '4.0.0', { author: 42 }),
      release(5, '5.0.0'),
      release(6, '6.0.0', { source: 3 }),
      release(7, '7.0.0', { lineage: [88] }),
      release(8, '8.0.0', { substrandId: '' }),
    ]
    const result = auditReleaseAncestry(rows)
    expect(result.parents.size).toBe(0)
    expect(result.skipped.map((s) => s.id)).toEqual([3, 4, 5, 7, 8])
    const duplicates = auditReleaseAncestry([
      release(1, '1.0.0'),
      release(2, '1.0.0'),
      release(3, '2.0.0'),
    ])
    expect(duplicates.parents.size).toBe(0)
    expect(duplicates.skipped).toHaveLength(1)
  })

  it('keeps descendant lineage bounded and refuses cyclic plans before changing them', () => {
    const result = auditReleaseAncestry([
      release(1, '1.0.0'),
      release(2, '2.0.0'),
      release(3, '2.0.1', {
        source: 2,
        lineage: Array.from({ length: MAX_LINEAGE }, (_, i) => i + 10),
      }),
    ])
    expect(result.lineage.get(3)).toHaveLength(MAX_LINEAGE)
    const cyclic = auditReleaseAncestry([release(1, '1.0.0', { source: 2 }), release(2, '2.0.0')])
    expect(cyclic.parents.size).toBe(0)
    expect(cyclic.skipped[0].reason).toMatch(/Cyclic/)
  })
})
