import { describe, expect, it } from 'vitest'

import type { PayloadRequest } from 'payload'
import type { LessonBundleVersion, User } from '../../src/payload-types'
import { findCommonAncestor, newestAncestor } from '../../src/lib/combine/ancestry'
import { backfillLineages } from '../../src/lib/combine/backfill'
import { MAX_LINEAGE, unionLineage } from '../../src/lib/combine/lineage'
import { comparableContent } from '../../src/lib/versionContent'

describe('Combine ancestry', () => {
  it('unions both parents and their delete-proof ancestors without duplicates', () => {
    expect(
      unionLineage([
        { id: 3, lineage: [1, 2] },
        { id: 4, lineage: [1, 2] },
      ]),
    ).toEqual([1, 2, 3, 4])
  })
  it('keeps the newest ids at the cap and drops the oldest on overflow', () => {
    const parents = Array.from({ length: MAX_LINEAGE }, (_, id) => ({ id: id + 1 }))
    expect(unionLineage(parents)).toHaveLength(MAX_LINEAGE)
    expect(unionLineage([{ id: MAX_LINEAGE + 1 }, ...parents.reverse()])).toEqual(
      Array.from({ length: MAX_LINEAGE }, (_, i) => i + 2),
    )
  })
  it.each(['a', 'b'])(
    'uses two-way comparison when %s has a full ancestry window',
    async (side) => {
      const version = (id: number, full: boolean) =>
        ({
          id,
          lineage: full ? Array.from({ length: MAX_LINEAGE }, (_, i) => i + 1) : [1],
        }) as LessonBundleVersion
      // The retained overlap at 1 must not become an automatic merge base when completeness is unknown.
      expect(
        await findCommonAncestor(
          {} as PayloadRequest,
          {} as User,
          version(3000, side === 'a'),
          version(4000, side === 'b'),
        ),
      ).toBeNull()
    },
  )
  it('backfills a long legacy chain without preventing future saves', () => {
    const rows = Array.from({ length: MAX_LINEAGE + 3 }, (_, i) => ({
      id: i + 1,
      source: i || null,
    }))
    const lineage = backfillLineages(rows).get(MAX_LINEAGE + 3)!
    expect(lineage).toHaveLength(MAX_LINEAGE)
    expect(lineage[0]).toBe(3)
    expect(lineage.at(-1)).toBe(MAX_LINEAGE + 2)
    expect(unionLineage([{ id: MAX_LINEAGE + 3, lineage }])[0]).toBe(4)
  })
  it('selects the highest numeric version among multiple common ancestors', () => {
    const rows = [
      { id: 3, semver: '1.0.9', createdAt: '2026-10-18' },
      { id: 2, semver: '1.0.10', createdAt: '2026-10-17' },
    ]
    expect(newestAncestor(rows)?.id).toBe(2)
    expect(newestAncestor(rows.reverse())?.id).toBe(2)
    expect(newestAncestor([])).toBeNull()
  })
  it('breaks equal-version ties by creation date, then id', () => {
    const rows = [
      { id: 9, semver: '1.0.1', createdAt: '2026-10-17' },
      { id: 2, semver: '1.0.1', createdAt: '2026-10-18' },
      { id: 3, semver: '1.0.1', createdAt: '2026-10-18' },
    ]
    expect(newestAncestor(rows)?.id).toBe(3)
  })
  it('backfills unordered chains and keeps existing paths past deleted parents on rerun', () => {
    expect(
      backfillLineages([
        { id: 4, source: 3, lineage: [1, 2, 3] },
        { id: 3, source: 1 },
        { id: 1, source: null },
      ]).get(4),
    ).toEqual([1, 2, 3])
  })
  it('backfills both-parent diamonds and refuses cycles', () => {
    expect(
      backfillLineages([
        { id: 1, source: null },
        { id: 2, source: 1 },
        { id: 3, source: 1 },
        { id: 4, source: 2, second: 3 },
      ]).get(4),
    ).toEqual([1, 2, 3])
    expect(() =>
      backfillLineages([
        { id: 1, source: 2 },
        { id: 2, source: 1 },
      ]),
    ).toThrow(/Cyclic/)
  })
  it('provenance cannot change content equality or bypass the no-op guard', () => {
    expect(comparableContent({ title: 'same', lineage: [1], mergedFrom: 2, mergeParent: 3 })).toBe(
      comparableContent({ title: 'same' }),
    )
  })
})
