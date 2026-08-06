/**
 * How this project talks to drizzle: the transaction-bound handle, and the two driver quirks that
 * surround it.
 *
 * These are statements about the ADAPTER, not about any feature, which is why they live here rather
 * than inside the module that first needed them. `endpoints/userAssignments.ts` hand-writes the same
 * `db.sessions[txID].db` reach for its `SELECT … FOR UPDATE`, and `tests/helpers/db.ts` centralises
 * the pool-only half for tests. Keeping a third copy inside a feature module would mean a Payload
 * upgrade that moves `sessions` breaks in several places with different failure modes, and the next
 * caller copies whichever it finds first.
 */
import type { PayloadRequest } from 'payload'

type DrizzleHandle = { execute: (q: unknown) => Promise<unknown> }

/**
 * The transaction-bound drizzle instance, or the pool when there is legitimately no transaction.
 *
 * `db.sessions[txID].db` is the same lookup @payloadcms/drizzle's own (unexported) `getTransaction()`
 * performs — verified against installed source.
 *
 * ⚑ **This FAILS CLOSED.** A `transactionID` present whose session cannot be resolved is an
 * inconsistency, not a licence to use the pool. Falling back there would run the statement on a
 * SEPARATE connection that commits independently of the transaction the caller believes it is inside
 * — so a write could land while the operation it belongs to rolled back. For edit recovery that is a
 * capture destroyed for a save that never happened; for `userAssignments` it is a row lock taken
 * outside the transaction it is meant to serialise. An unresolvable session therefore throws rather
 * than degrades.
 *
 * Callers with no transaction at all (background jobs) get the pool, which is correct for them.
 */
export const txDb = async (req: PayloadRequest): Promise<DrizzleHandle> => {
  const adapter = req.payload.db as unknown as {
    sessions?: Record<string, { db: DrizzleHandle }>
    drizzle: DrizzleHandle
  }
  const id = req.transactionID != null ? String(await req.transactionID) : undefined
  const session = id ? adapter.sessions?.[id]?.db : undefined

  if (id && !session) {
    throw new Error(
      `transactionID ${id} has no drizzle session — refusing to run on the pool, which would ` +
        'commit independently of the caller’s transaction.',
    )
  }
  return session ?? adapter.drizzle
}

/**
 * drizzle's `execute` returns a driver-shaped result, and the codebase has disagreed with itself
 * about whether that can be a bare array (`lib/rateLimit.ts` assumes `{ rows }` only). One answer,
 * here, rather than a guess per call site.
 */
export const rowsOf = (result: unknown): Record<string, unknown>[] => {
  const r = result as { rows?: Record<string, unknown>[] } | Record<string, unknown>[]
  return Array.isArray(r) ? r : (r?.rows ?? [])
}

/**
 * Postgres `numeric` arrives as a STRING (node-postgres avoids precision loss by not parsing it), so
 * any numeric column read through raw SQL must be normalised or it will fail every `===` comparison
 * against a number. Throws rather than yielding NaN: a value that cannot be parsed is a schema or
 * driver surprise worth failing loudly on, not one worth propagating.
 */
export const toInt = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error(`expected a numeric column value, got: ${String(v)}`)
  return n
}
