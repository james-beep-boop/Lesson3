/**
 * How this project talks to drizzle: the transaction-bound handle, and the two driver quirks that
 * surround it.
 *
 * These are statements about the ADAPTER, not about any feature, which is why they live here rather
 * than inside the module that first needed them. Three feature modules used to hand-write the same
 * `db.sessions[txID].db` reach for a `SELECT … FOR UPDATE` — `ingest/index.ts`, `hooks/userRoles.ts`
 * and `endpoints/userAssignments.ts` — and all three ended in a pool fallback that made the lock hold
 * nothing. They now go through `lockRows` below. `tests/helpers/db.ts` centralises the pool-only half
 * for tests. One definition means a Payload upgrade that moves `sessions` breaks in one place, rather
 * than in several with different failure modes.
 */
import { sql } from '@payloadcms/db-postgres'
import { APIError, type CollectionSlug, type PayloadRequest } from 'payload'

type DrizzleHandle = { execute: (q: unknown) => Promise<unknown> }

/**
 * The minimum needed to find a transaction-bound connection.
 *
 * A full `PayloadRequest` satisfies it, and so — the reason it exists — does ingest's `IngestReq`,
 * which is a `Partial<PayloadRequest>` and therefore NOT assignable to the `PayloadRequest` this
 * function used to demand. Widening to the two fields actually read is what let those callers stop
 * re-deriving the adapter reach for themselves.
 */
export type TxSource = Pick<PayloadRequest, 'payload' | 'transactionID'>

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
  req: TxSource,
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
 * The POOL drizzle handle, for a trusted read-only aggregate that belongs to no caller's transaction.
 *
 * ⚑ THE CAST LIVES HERE, ONCE. This file opens by claiming to own "how this project talks to
 * drizzle… one definition means a Payload upgrade that moves `sessions` breaks in one place, rather
 * than in several with different failure modes" — and two count helpers then re-derived the adapter
 * themselves anyway (`versionCounts.ts`, and `assignmentCounts.ts` copied it from there). The cast is
 * `as unknown as`, so it defeats type-checking outright: an upgrade that moves `drizzle` off the
 * adapter compiles clean and fails at runtime as "Cannot read properties of undefined".
 *
 * ⚑ DELIBERATELY NOT `txDb`. `txDb` REFUSES the pool when a transaction is active, which is right for
 * a write that must commit with its caller. These are read-only aggregates issued from a server
 * render with no transaction in play, and they want the pool — so they get a named door rather than
 * a second private copy of the same cast.
 */
export const poolDb = (payload: { db: unknown }): DrizzleHandle =>
  (payload.db as { drizzle: DrizzleHandle }).drizzle

/**
 * Tables this project takes row locks on.
 *
 * A CLOSED UNION, because a table name cannot be a bound parameter — it is interpolated into the
 * statement as an identifier, so it must never be able to originate in caller data. Adding a table
 * here is a deliberate edit; passing one through from a request is impossible.
 */
export type LockableTable = 'subject_grades' | 'users' | 'lesson_plans'

/**
 * The collection represented by each lockable database table.
 *
 * Keep this explicit: a string transform cannot prove that a new table has a corresponding Payload
 * collection, while `satisfies` makes every member of the closed table union name a real slug.
 */
const COLLECTION_OF = {
  lesson_plans: 'lesson-plans',
  subject_grades: 'subject-grades',
  users: 'users',
} as const satisfies Record<LockableTable, CollectionSlug>

/**
 * Take `SELECT … FOR UPDATE` row locks inside the caller's transaction, in ascending id order.
 *
 * ⚑ WHY THIS EXISTS RATHER THAN THREE HAND-ROLLED COPIES. `ingest/index.ts`, `hooks/userRoles.ts`
 * and `endpoints/userAssignments.ts` each spelled this out themselves, and **all three ended in
 * `?? adapter.drizzle`** — falling back to the pool when the transaction session could not be
 * resolved. That fallback is not a degradation, it is a silent failure: `FOR UPDATE` on a pooled
 * connection outside a transaction is released the instant the statement returns, so the lock holds
 * nothing while every caller continues as though it does. Each of those three locks exists to
 * serialise a read-then-write, and each was one unresolvable session away from not serialising
 * anything. Routing them through `txDb` makes that case throw.
 *
 * ⚑ ASCENDING ORDER IS THE DEADLOCK GUARD, and it is now universal rather than remembered.
 * `lockSubjectGrades` sorted its ids for this reason and the other two did not (each locking a
 * single row, so it did not arise). `ORDER BY id` inside the locking statement makes Postgres take
 * the locks in that order, so two callers over overlapping id sets queue instead of deadlocking —
 * and it does so in ONE round trip rather than one per id.
 *
 * ⚑ THERE IS NO OPT-OUT, deliberately. This took a `requireTransaction` option briefly; no caller
 * passed it, and the only thing it could express is the pool lock this function exists to abolish —
 * so it re-opened the door in the API while the docblock, both wiring specs and the integration spec
 * all said it must stay shut. A transaction-less lock is now unrepresentable through this function.
 * (`txDb` keeps the option: its edit-recovery callers legitimately split both ways.)
 */
export async function lockRows(
  source: TxSource,
  table: LockableTable,
  ids: ReadonlyArray<number>,
): Promise<void> {
  const unique = [...new Set(ids)].sort((a, b) => a - b)
  if (unique.length === 0) return

  const db = await txDb(source, { requireTransaction: true })

  // Each id is BOUND as its own parameter. `= ANY(${array})` reads better and was tried first, but
  // drizzle renders it as `ANY(($1))` and node-postgres then serialises the JS array as a plain
  // string — Postgres answers `22P02: Array value must start with "{"`. Joining bound chunks is the
  // form that actually parameterises. Only the table name is interpolated, and it comes from a
  // closed union, never from caller data.
  const idList = sql.join(
    unique.map((id) => sql`${id}`),
    sql`, `,
  )
  await db.execute(
    sql`SELECT id FROM ${sql.raw(`"${table}"`)} WHERE id IN (${idList}) ORDER BY id FOR UPDATE`,
  )
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

/**
 * Lock one row of `table`, then read it back and refuse a STALE optimistic-concurrency token.
 *
 * The sequence — lock, re-read post-lock, compare `updatedAt`, 409 — is the shape every
 * freshness-guarded authorization endpoint needs, and it was written out twice (`userAssignments`,
 * `userAdminActions`) before being extracted. The order is what matters and is easy to get subtly
 * wrong: reading BEFORE the lock lets two requests carrying the same fresh token both pass the
 * comparison, and the later write silently drops the earlier delta.
 *
 * ⚑ THIS TAKES THE ROW LOCK ONLY, and it is the SECOND of two locks. Any caller whose write can
 * reach `guardLastSiteAdmin` must call `takeAdminCountLock` BEFORE this — a generic `PATCH`/`DELETE`
 * meets that global key in its hooks, i.e. before Payload's DML takes the row, so advisory-then-row
 * is the order every writer must share. Doing it the other way round deadlocks a same-user race, and
 * that is not hypothetical: the first version of `userAdminActions` did exactly that.
 */
export async function lockAndVerifyFresh<T extends { updatedAt?: unknown }>(
  req: PayloadRequest,
  table: LockableTable,
  id: number,
  expectedUpdatedAt: string,
  staleMessage: string,
): Promise<T> {
  await lockRows(req, table, [id])
  const target = (await req.payload.findByID({
    collection: COLLECTION_OF[table],
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })) as unknown as T
  if (Date.parse(String(target.updatedAt)) !== Date.parse(expectedUpdatedAt)) {
    throw new APIError(staleMessage, 409)
  }
  return target
}
