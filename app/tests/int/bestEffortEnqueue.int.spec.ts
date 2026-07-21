/**
 * Best-effort enqueues must not be able to destroy the write they ride on (L3-03, 2026-07-21).
 *
 * THE BUG THIS PINS. `messagePing` and `prewarmVersionArtifacts` are "best-effort": their comments
 * promised that a failure to ENQUEUE could never fail the primary write. It could. Both passed `req`
 * to `jobs.queue`, enlisting the insert in the caller's transaction, so a failed insert ABORTED that
 * transaction. The surrounding catch then swallowed the error and the hook returned normally —
 * and installed drizzle's `commitTransaction` is:
 *
 *     try { await session.resolve() }   // COMMIT — throws, transaction is aborted
 *     catch { await session.reject() }  // ROLLBACK, error swallowed
 *
 * so the commit silently became a rollback. Net effect: a 201 with the created document in the
 * response body and NOTHING PERSISTED. The swallow was not protecting the message; it was hiding
 * the message's death.
 *
 * The fix omits `req`, so the insert runs on its own connection (`jobs.queue` does
 * `args.req ?? createLocalReq({}, payload)`) and cannot poison the caller.
 *
 * WHY THE FAULT INJECTION RUNS REAL SQL. The first draft of this test simply mocked `jobs.queue` to
 * reject — and it PASSED against the broken code, proving nothing. A rejected mock is a JavaScript
 * throw; it never touches the database, so nothing poisons the transaction. The bug needs a real
 * FAILED STATEMENT on the caller's transaction connection. So the mock below executes one (`SELECT
 * 1/0`) on `args.req`'s transaction when a `req` is passed, faithfully reproducing what a failed job
 * insert does, and then throws.
 *
 * That makes the two designs genuinely distinguishable:
 *   • with `req` (the bug)  -> the tx is poisoned -> commit silently rolls back -> message GONE
 *   • without `req` (fixed) -> there is no caller tx to poison -> message SURVIVES
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import { sql } from 'drizzle-orm'

import config from '../../src/payload.config.js'
import { MARK, MARK_BASE, createUserVerified, purgeMarked } from '../helpers/fixtures.js'

let payload: Payload
let sender: { id: number }
let seq = 0

/** A FRESH recipient per test. The ping hook only fires on the recipient's FIRST unread message
 *  (`otherUnread > 0` returns early) and is capped per recipient per day — so reusing one recipient
 *  silently skips the enqueue and makes these tests pass without exercising anything. */
const newRecipient = async (): Promise<{ id: number }> =>
  (await createUserVerified(payload, {
    name: `${MARK}enq-recipient-${++seq}`,
    email: `${MARK}enq-recipient-${seq}@example.test`.toLowerCase(),
    password: 'enqueue-probe-pass',
  })) as unknown as { id: number }

beforeAll(async () => {
  payload = await getPayload({ config })
  await purgeMarked(payload, MARK_BASE)
  sender = (await createUserVerified(payload, {
    name: `${MARK}enq-sender`,
    email: `${MARK}enq-sender@example.test`.toLowerCase(),
    password: 'enqueue-probe-pass',
  })) as unknown as { id: number }
})

afterAll(async () => {
  vi.restoreAllMocks()
  await purgeMarked(payload, MARK_BASE)
})

describe('best-effort enqueue cannot destroy the primary write (L3-03)', () => {
  it('a message still persists when its ping enqueue throws', async () => {
    const recipient = await newRecipient()
    const body = `${MARK}survives-a-failed-enqueue`

    // Fault-inject a REAL failed statement on whatever transaction the enqueue was handed — this is
    // what a failing job insert actually does to Postgres. If the caller passed `req` (the bug), the
    // create's own transaction is poisoned and its commit becomes a silent rollback.
    const adapter = payload.db as unknown as {
      sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }>
    }
    const queueSpy = vi
      .spyOn(payload.jobs, 'queue')
      .mockImplementation(async (args: { req?: { transactionID?: unknown } }) => {
        const txId = args?.req?.transactionID
        if (txId != null) {
          const txDb = adapter.sessions?.[String(await txId)]?.db
          // Deliberately invalid — errors on the SHARED connection, aborting the caller's tx.
          if (txDb) await txDb.execute(sql`SELECT 1/0`).catch(() => undefined)
        }
        throw new Error('simulated queue insert failure')
      })

    let created: { id: number | string } | undefined
    let enqueueAttempts = 0
    try {
      created = (await payload.create({
        collection: 'messages',
        data: { sender: sender.id, recipient: recipient.id, body } as never,
        overrideAccess: true,
      })) as unknown as { id: number | string }
    } finally {
      // Read the call count BEFORE restoring — `mockRestore()` also clears the recorded calls, so
      // asserting after it silently reads zero (an earlier draft of this test did, and "failed" for
      // that reason rather than for anything about the product).
      enqueueAttempts = queueSpy.mock.calls.length
      queueSpy.mockRestore()
    }

    // GUARD AGAINST A VACUOUS PASS: if the hook skipped the enqueue (it only pings a recipient's
    // FIRST unread), the mock never fires and this test would "pass" while proving nothing. An
    // earlier draft did exactly that.
    expect(enqueueAttempts).toBe(1)

    // The create must report success...
    expect(created?.id).toBeTruthy()

    // ...and — the part that actually failed before — the row must really be in the database.
    // Re-read rather than trusting the returned document: the old bug's whole signature was a
    // populated response object for a row that had been rolled back.
    const { totalDocs } = await payload.count({
      collection: 'messages',
      where: { body: { equals: body } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(1)
  })

  it('the enqueue is issued WITHOUT the caller req, so it cannot join that transaction', async () => {
    // Belt-and-braces on the mechanism itself: passing `req` is what enlisted the insert in the
    // caller's transaction. Asserting this alone would be a weak test (see the header), but paired
    // with the durability check above it names the specific property that keeps it true.
    const recipient = await newRecipient()
    const queueSpy = vi.spyOn(payload.jobs, 'queue')
    const body = `${MARK}enqueue-arg-shape`
    await payload.create({
      collection: 'messages',
      data: { sender: sender.id, recipient: recipient.id, body } as never,
      overrideAccess: true,
    })
    expect(queueSpy).toHaveBeenCalled()
    for (const call of queueSpy.mock.calls) {
      expect((call[0] as { req?: unknown }).req).toBeUndefined()
    }
    queueSpy.mockRestore()
  })
})
