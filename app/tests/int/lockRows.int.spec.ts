/**
 * `lockRows` (`src/lib/txDb.ts`) — the one row-lock primitive, and the reason it FAILS CLOSED.
 *
 * THE DEFECT THIS REPLACES. Three call sites — `ingest/index.ts`, `hooks/userRoles.ts` and
 * `endpoints/userAssignments.ts` — each hand-rolled the `db.sessions[txID].db` reach and each ended
 * in `?? adapter.drizzle`. That fallback reads like graceful degradation and is nothing of the sort:
 * `SELECT … FOR UPDATE` issued on a POOLED connection with no transaction open is released the
 * instant the statement returns. The lock holds nothing, the caller proceeds believing its
 * read-then-write is serialised, and the race the lock exists to close is wide open again — with no
 * error anywhere to say so. Every one of those three was one unresolvable session away from that.
 *
 * ⚑ WHAT THE TWO CASES BELOW ARE FOR. The first proves the lock actually blocks a competing
 * transaction (it does something). The second proves it REFUSES to run without a transaction rather
 * than silently doing nothing (it cannot pretend). A guard that only had the first would still pass
 * against the old fail-open code, which is precisely how this defect survived three call sites.
 *
 * ⚑ WHAT IS DELIBERATELY *NOT* HERE. A third case once asserted "locks every requested row,
 * deduplicated" by counting `pg_locks` rows in `RowShareLock` mode. It was removed: that mode is the
 * TABLE-level lock every `SELECT … FOR UPDATE` takes regardless of how many rows match, so `> 0` was
 * satisfied by any locking statement anywhere — including another spec's. It restated case 1 weakly
 * under a name promising coverage it did not provide. Dedup and ordering are properties of the
 * STATEMENT, pinned exactly and cheaply by the wiring specs in `tests/unit`.
 *
 * Requires a DB (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { stillPendingAfterWindow, whileRowLocked } from '../helpers/rowLocks.js'
import { lockRows, type TxSource } from '../../src/lib/txDb.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('lockRows', () => {
  /**
   * ⚑ THE TRANSACTION MUST OUTLIVE THE HOLDER, which is why it is opened and committed around
   * `whileRowLocked` rather than inside it. A tidier-looking `inTransaction(work)` wrapper that
   * commits in a `finally` DEADLOCKS: the commit waits on the still-blocked lock, while the holder
   * waits for `work` to return before releasing. Sixty seconds of nothing, which is how it was found.
   *
   * Payload sets `transactionID` by side effect — the very reason `lockRows` must check at runtime —
   * so the honest way to exercise the success path is to let Payload create the transaction rather
   * than fake an id.
   */
  it('blocks a competing transaction until the holder commits', async () => {
    const sgId = fx.subjectGrade.id
    const txId = await fx.payload.db.beginTransaction?.()
    const source: TxSource = { payload: fx.payload, transactionID: txId ?? undefined }

    let blocked = false
    let attempt!: Promise<void>

    try {
      await whileRowLocked(fx.payload, 'subject_grades', sgId, async () => {
        attempt = lockRows(source, 'subject_grades', [sgId])
        blocked = await stillPendingAfterWindow(attempt)
      })

      expect(blocked, 'the lock must wait for the holder rather than returning immediately').toBe(
        true,
      )
      await attempt // free once the holder released
    } finally {
      if (txId != null) await fx.payload.db.commitTransaction?.(txId)
    }
  }, 60_000)

  /**
   * ⚑ THE CASE THAT PINS THE FIX. With no transaction, the OLD code ran on the pool and "succeeded"
   * while locking nothing. `lockRows` must throw instead — and the message must say why, because the
   * whole failure mode is that nobody could tell.
   */
  it('REFUSES to run without a transaction, rather than locking nothing on the pool', async () => {
    await expect(
      lockRows({ payload: fx.payload, transactionID: undefined }, 'subject_grades', [
        fx.subjectGrade.id,
      ]),
    ).rejects.toThrow(/must run inside the caller’s transaction/i)
  })

  it('is a no-op for an empty id list, without touching the database', async () => {
    // No transaction, so the refusal above would fire if this reached `txDb` at all.
    await expect(
      lockRows({ payload: fx.payload, transactionID: undefined }, 'subject_grades', []),
    ).resolves.toBeUndefined()
  })
})
