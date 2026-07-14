/**
 * `retargetFollowerFavorites` runs inside the make-official transaction. A favorite that VANISHED
 * mid-retarget (concurrent un-favorite) is a benign per-row skip — Payload throws NotFound before
 * any failing SQL, so the transaction is intact. But ANY OTHER error (notably a compound-unique
 * violation from a follower who starred the new Official concurrently) has already poisoned the
 * Postgres transaction; swallowing it would let make-official report success on a promotion
 * Postgres rolled back (Codex 2026-07-13, P2). This pins that contract WITHOUT a DB: NotFound is
 * skipped, everything else propagates.
 */
import { describe, it, expect, vi } from 'vitest'
import { NotFound } from 'payload'

import { retargetFollowerFavorites } from '@/hooks/lessonPlan'

// A plain follower (no editor assignment) whose favorite must be re-pointed via `update`.
// Numeric ids: `relId` only reads a number or a populated `{ id }` object.
const follower = { id: 1, roles: ['teacher'], assignments: [] }

function makeCase(updateImpl: () => Promise<unknown>) {
  const find = vi
    .fn()
    // 1) favorites on the previous Official
    .mockResolvedValueOnce({ docs: [{ id: 100, user: 1 }] })
    // 2) owners (users) — Promise.all order is [users, favorites-on-new]
    .mockResolvedValueOnce({ docs: [follower] })
    // 3) favorites already on the new Official → none, so fav1 takes the UPDATE path
    .mockResolvedValueOnce({ docs: [] })
  const warn = vi.fn()
  const req = {
    payload: { find, update: vi.fn(updateImpl), delete: vi.fn().mockResolvedValue({}), logger: { warn, error: vi.fn() } },
    context: {},
  }
  const call = () =>
    retargetFollowerFavorites({
      doc: { officialVersion: 2, subjectGrade: 10 },
      previousDoc: { officialVersion: 1 },
      req,
    } as never)
  return { call, warn }
}

describe('retargetFollowerFavorites transaction-error contract', () => {
  it('skips a vanished favorite (NotFound) and completes without throwing', async () => {
    const { call, warn } = makeCase(() => Promise.reject(new NotFound()))
    await expect(call()).resolves.toBeDefined()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('re-throws a transaction-poisoning error (e.g. a unique violation) instead of swallowing it', async () => {
    const { call } = makeCase(() => Promise.reject(new Error('duplicate key value violates unique constraint')))
    await expect(call()).rejects.toThrow(/unique constraint/)
  })
})
