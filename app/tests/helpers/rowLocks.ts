/**
 * Row-lock test scaffolding: hold a row from an independent transaction, and ask whether an
 * operation is still blocked.
 *
 * ⚑ WHY THIS IS SHARED. Both `tests/int/officialPointerLock.int.spec.ts` and
 * `tests/int/lockRows.int.spec.ts` need the same two things, and when the second one re-derived them
 * it dropped BOTH of the first's hardening details — the release-in-`finally` and the `clearTimeout`
 * — each of which exists because of a specific failure. That is the ordinary fate of copied test
 * machinery, and the reason it now lives in one place: the hardened version is the only version.
 */
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { drizzleOf } from './db'

/**
 * How long a blocked operation is given to prove it is blocked.
 *
 * The one number that decides whether these specs are guards or coin flips, in BOTH directions: too
 * short and an ordinarily slow-but-unblocked operation looks blocked (a false green against a
 * reverted lock); too long and every run pays for it. 1.5s sits far above the few milliseconds an
 * unblocked delete or update takes here — the mutation runs completed in ~40ms — and the assertion
 * is one-sided: it only ever claims "did not finish", never "finished in time".
 */
export const BLOCKED_WINDOW_MS = 1_500

/** Drizzle's transaction API, which takes a DEDICATED connection — the point of using it here. */
type TxRunner = {
  transaction: <T>(fn: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<T>) => Promise<T>
}

/** Table names these helpers may lock. Closed for the same reason `LockableTable` is in `txDb.ts`. */
export type LockableTestTable = 'subject_grades' | 'users' | 'lesson_plans'

/**
 * Hold `table.id = id` locked in an independent transaction for as long as `work` runs, then release
 * it and return what `work` produced.
 *
 * Uses drizzle's own `transaction`, which checks out a dedicated connection — a `FOR UPDATE` issued
 * on the shared pool would be released the moment the statement returned and would hold nothing.
 *
 * ⚑ The gate is resolved in a `finally`, so a THROWING `work` — which is what a failing assertion
 * is — still releases the row rather than parking a connection for the rest of the suite. Both int
 * suites run with `fileParallelism: false` against one shared Payload, so a parked connection is a
 * cross-file cost, not a local one.
 */
export async function whileRowLocked<T>(
  payload: Payload,
  table: LockableTestTable,
  id: number,
  work: () => Promise<T>,
): Promise<T> {
  return whileLockHeld(
    payload,
    sql`SELECT id FROM ${sql.raw(`"${table}"`)} WHERE id = ${id} FOR UPDATE`,
    work,
  )
}

/**
 * Hold an ARBITRARY lock — whatever `lockStatement` acquires — for as long as `work` runs.
 *
 * ⚑ THIS IS THE GENERAL FORM, and `whileRowLocked` is now a one-line wrapper over it. It was
 * extracted when a spec needed to hold `pg_advisory_xact_lock` rather than a row: the first version
 * copied this function's body and changed one statement, which is precisely the re-derivation this
 * file's header says centralising was meant to stop. A caller that needs a different lock passes a
 * different statement instead of a seventh copy of the gate/holder pair.
 *
 * The statement must acquire a TRANSACTION-scoped lock, since that is what the dedicated connection
 * below holds open — a lock released at statement end would hold nothing.
 */
export async function whileLockHeld<T>(
  payload: Payload,
  lockStatement: ReturnType<typeof sql>,
  work: () => Promise<T>,
): Promise<T> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  let started!: () => void
  const holding = new Promise<void>((resolve) => {
    started = resolve
  })

  const holder = (drizzleOf(payload) as unknown as TxRunner).transaction(async (tx) => {
    await tx.execute(lockStatement)
    started()
    await gate
  })

  await holding
  try {
    return await work()
  } finally {
    release()
    await holder
  }
}

/**
 * Run `op` and report whether it was still unfinished after {@link BLOCKED_WINDOW_MS}.
 *
 * `op` is raced rather than awaited, and its rejection is swallowed here — the caller always awaits
 * it afterwards, and an unawaited rejection would surface as an unhandled rejection that fails an
 * unrelated spec later in the run.
 */
export async function stillPendingAfterWindow(op: Promise<unknown>): Promise<boolean> {
  const marker = Symbol('pending')
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timer = new Promise<typeof marker>((resolve) => {
    timeout = setTimeout(() => resolve(marker), BLOCKED_WINDOW_MS)
  })
  try {
    const settled = op.then(() => 'settled' as const).catch(() => 'settled' as const)
    return (await Promise.race([settled, timer])) === marker
  } finally {
    // Cleared so an early-settling run — i.e. a FAILING one — does not leave a live timer behind it.
    clearTimeout(timeout)
  }
}
