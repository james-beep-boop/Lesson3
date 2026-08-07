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
 * `requireTransaction` additionally rejects having NO transaction at all. Retirement-by-save-as-new
 * passes it, because there "none" is exactly as wrong as "unresolvable": the statement must be part of
 * the caller's atomic unit or it must not run. Background jobs (expiry) are the legitimate
 * no-transaction callers and omit it.
 *
 * ⚑ This is RUNTIME enforcement, not a compile-time guarantee. A caller can still hand over a
 * transaction-less `req`; what it cannot do is have that silently succeed.
 */
export const txDb = async (
  req: PayloadRequest,
  opts?: { requireTransaction?: boolean },
): Promise<DrizzleHandle> => {
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
  if (opts?.requireTransaction && !session) {
    throw new Error(
      'this statement must run inside the caller’s transaction, but none is active — refusing to ' +
        'run on the pool, where it would commit independently of the operation it belongs to.',
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
 * any numeric counter read through raw SQL must be normalised or it will fail every `===` comparison
 * against a number.
 *
 * Named for the contract it actually enforces, rather than the looser `toInt` it started as. The
 * callers are monotonic counters — generations and revisions — which are integers ≥ 1 by
 * construction. A fraction, a zero, a negative, or a value past `Number.MAX_SAFE_INTEGER` all mean
 * something upstream is wrong, and `numeric` is exactly the column type that can carry all four past
 * a `Number.isFinite` check. Beyond the safe-integer boundary, `+ 1` stops advancing and a CAS
 * precondition would start matching a revision that never happened, so silence there is the worst
 * option available.
 */
export const toPositiveInt = (v: unknown): number => {
  // The INPUT domain is restricted before any coercion, because `Number()` is far too willing:
  // `Number(true)` is 1 and `Number(['5'])` is 5, either of which would pass the safe-integer check
  // below as a plausible counter. Only a number or a string — what the driver actually hands back for
  // `numeric` — may be coerced at all.
  //
  // Blank strings need no special case: `Number('')` and `Number('  ')` are 0, which `n < 1` already
  // rejects. An earlier version tested for them explicitly and the comment claimed they would "sail
  // through", which was simply wrong about `Number`'s behaviour.
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : Number.NaN
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`expected a positive safe integer from a numeric column, got: ${String(v)}`)
  }
  return n
}
