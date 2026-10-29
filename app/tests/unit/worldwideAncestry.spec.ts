/**
 * Worldwide ancestry keys (2026-10-29; `lib/identity/ancestorKey.ts`, `unionLineageKeys`).
 *
 * The keys borrow the numeric lineage's order and cap — they are never ordered by themselves — and stay
 * aligned with it index-for-index, including when two local rows share one release fingerprint.
 */
import { describe, expect, it } from 'vitest'

import { ancestorKey, localAncestorKey } from '../../src/lib/identity/ancestorKey'
import { MAX_LINEAGE, unionLineage, unionLineageKeys } from '../../src/lib/combine/lineage'

const FP = 'ares-content-v1:sha256:' + 'a'.repeat(64)
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('ancestorKey', () => {
  it('names a release by its fingerprint and anything else by its uid', () => {
    expect(ancestorKey({ uid: uid(1), releaseFingerprint: FP })).toBe(FP)
    expect(ancestorKey({ uid: uid(1), releaseFingerprint: null })).toBe(uid(1))
    expect(() => ancestorKey({})).toThrow()
  })
  it('gives a lost ancestor a key scoped to this installation', () => {
    expect(localAncestorKey('inst', 7)).toBe('local:inst:7')
  })
})

describe('unionLineageKeys', () => {
  it('unions overlapping branches by serial, in either parent order', () => {
    const a = { id: 3, key: uid(3), lineage: [1], lineageKeys: [FP] }
    const b = { id: 2, key: uid(2), lineage: [1], lineageKeys: [FP] }
    const forward = unionLineageKeys([a, b])
    expect(forward).toEqual({ lineage: [1, 2, 3], lineageKeys: [FP, uid(2), uid(3)] })
    expect(unionLineageKeys([b, a])).toEqual(forward)
  })

  it('keeps the parents’ histories [1,3] and [1,2] as [1,2,3]', () => {
    const p = { id: 4, key: uid(4), lineage: [1, 3], lineageKeys: [uid(1), uid(3)] }
    const q = { id: 5, key: uid(5), lineage: [1, 2], lineageKeys: [uid(1), uid(2)] }
    expect(unionLineageKeys([p, q]).lineageKeys).toEqual([uid(1), uid(2), uid(3), uid(4), uid(5)])
  })

  it('keeps a deleted ancestor’s key, carried in a parent’s arrays', () => {
    // Serial 2 has no row any more; only the parent's aligned array still names it.
    const parent = { id: 3, key: uid(3), lineage: [1, 2], lineageKeys: [FP, uid(2)] }
    expect(unionLineageKeys([parent]).lineageKeys).toEqual([FP, uid(2), uid(3)])
  })

  it('keeps a repeated fingerprint once per serial, so the arrays stay aligned', () => {
    // Two local release rows with one fingerprint (serials 1 and 2), each with a child.
    const c1 = { id: 3, key: uid(3), lineage: [1], lineageKeys: [FP] }
    const c2 = { id: 4, key: uid(4), lineage: [2], lineageKeys: [FP] }
    const merged = unionLineageKeys([c1, c2])
    expect(merged.lineage).toEqual([1, 2, 3, 4])
    expect(merged.lineageKeys).toEqual([FP, FP, uid(3), uid(4)])
  })

  it('leaves a serial no parent can name unnamed, and ignores misaligned arrays', () => {
    const misaligned = { id: 5, key: uid(5), lineage: [1, 2], lineageKeys: [uid(1)] }
    expect(unionLineageKeys([misaligned])).toEqual({
      lineage: [1, 2, 5],
      lineageKeys: [undefined, undefined, uid(5)],
    })
  })

  it('trims keys exactly where the numeric cap trims serials', () => {
    const lineage = Array.from({ length: MAX_LINEAGE }, (_, i) => i + 1)
    const parent = {
      id: MAX_LINEAGE + 1,
      key: uid(MAX_LINEAGE + 1),
      lineage,
      lineageKeys: lineage.map(uid),
    }
    const out = unionLineageKeys([parent])
    expect(out.lineage).toEqual(unionLineage([parent]))
    expect(out.lineage).toHaveLength(MAX_LINEAGE)
    expect(out.lineage[0]).toBe(2)
    expect(out.lineageKeys).toEqual(out.lineage.map(uid))
  })

  it('never orders by the keys themselves', () => {
    // Keys that sort the opposite way to their serials keep the serials' order.
    const parent = { id: 3, key: 'a', lineage: [1, 2], lineageKeys: ['z', 'm'] }
    expect(unionLineageKeys([parent]).lineageKeys).toEqual(['z', 'm', 'a'])
  })
})
