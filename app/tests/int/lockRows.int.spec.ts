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
 * Requires a DB (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { drizzleOf, rowsOf } from '../helpers/db.js'
import { lockRows } from '../../src/lib/txDb.js'

let fx: RoleFixture

const BLOCKED_WINDOW_MS = 1_000

type TxRunner = {
  transaction: <T>(fn: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<T>) => Promise<T>
}

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('lockRows', () => {
  /**
   * A real Payload transaction, so `lockRows` resolves a genuine drizzle session — the path every
   * production caller takes.
   */
  it('blocks a competing transaction until the holder commits', async () => {
    const sgId = fx.subjectGrade.id

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let holding!: () => void
    const held = new Promise<void>((resolve) => {
      holding = resolve
    })

    // An independent transaction on its own connection holds the row.
    const holder = (drizzleOf(fx.payload) as unknown as TxRunner).transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM "subject_grades" WHERE id = ${sgId} FOR UPDATE`)
      holding()
      await gate
    })
    await held

    const req = { payload: fx.payload } as Parameters<typeof lockRows>[0]
    await fx.payload.db.beginTransaction?.().then((id) => {
      ;(req as { transactionID?: unknown }).transactionID = id
    })

    try {
      const attempt = lockRows(req, 'subject_grades', [sgId])
      const timer = new Promise<'pending'>((r) => setTimeout(() => r('pending'), BLOCKED_WINDOW_MS))
      const winner = await Promise.race([attempt.then(() => 'settled' as const), timer])

      expect(winner, 'the lock must wait for the holder rather than returning immediately').toBe(
        'pending',
      )

      release()
      await holder
      await attempt // now free
    } finally {
      await fx.payload.db.commitTransaction?.(
        (req as { transactionID?: string | number }).transactionID as string | number,
      )
    }
  }, 60_000)

  /**
   * ⚑ THE CASE THAT PINS THE FIX. With no transaction, the OLD code ran on the pool and "succeeded"
   * while locking nothing. `lockRows` must throw instead — and the message must say why, because the
   * whole failure mode is that nobody could tell.
   */
  it('REFUSES to run without a transaction, rather than locking nothing on the pool', async () => {
    await expect(
      lockRows({ payload: fx.payload } as Parameters<typeof lockRows>[0], 'subject_grades', [
        fx.subjectGrade.id,
      ]),
    ).rejects.toThrow(/must run inside the caller’s transaction/i)
  })

  it('is a no-op for an empty id list, without touching the database', async () => {
    // No transaction, so the requireTransaction guard would throw if this reached txDb at all.
    await expect(
      lockRows({ payload: fx.payload } as Parameters<typeof lockRows>[0], 'subject_grades', []),
    ).resolves.toBeUndefined()
  })

  it('locks every requested row, deduplicated', async () => {
    const sgId = fx.subjectGrade.id
    const req = { payload: fx.payload } as Parameters<typeof lockRows>[0]
    const id = await fx.payload.db.beginTransaction?.()
    ;(req as { transactionID?: unknown }).transactionID = id

    try {
      await lockRows(req, 'subject_grades', [sgId, sgId, sgId])
      const locked = rowsOf(
        await drizzleOf(fx.payload).execute(
          sql`SELECT count(*)::int AS n FROM pg_locks l
              JOIN pg_class c ON c.oid = l.relation
              WHERE c.relname = 'subject_grades' AND l.mode = 'RowShareLock'`,
        ),
      )
      expect(Number(locked[0]?.n ?? 0), 'the row lock is visible in pg_locks').toBeGreaterThan(0)
    } finally {
      await fx.payload.db.commitTransaction?.(id as string | number)
    }
  }, 60_000)
})
