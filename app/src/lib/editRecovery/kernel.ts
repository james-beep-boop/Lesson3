/**
 * Edit-recovery persistence kernel (design §4) — the atomic statements, with no HTTP around them.
 *
 * Everything here is raw SQL for one reason: each operation must be a SINGLE statement whose
 * preconditions are evaluated *inside* the write. A read-then-write through the Local API cannot do
 * that — two tabs both read, both pass, and the later write silently drops the earlier one. The
 * fencing protocol is only worth anything if it is atomic, so it lives at the SQL level and is tested
 * against a real database rather than reasoned about.
 *
 * ⚑ **Every statement runs on the REQUEST'S transaction** via {@link txDb}. Retirement joins the
 * save-as-new transaction inside its semver retry (§4), so a statement that quietly ran on the pool
 * instead would commit independently of the save it is supposed to be part of — retiring a capture
 * for a save that then rolled back, which is exactly the work-destroying outcome this feature exists
 * to prevent.
 *
 * ⚑ **`generation` and `revision` are `numeric` columns**, and node-postgres returns `numeric` as a
 * STRING to avoid precision loss. Every value read back is therefore normalised through
 * {@link toInt} rather than trusted — an unnormalised `revision` would compare `'2' !== 2` in a CAS
 * precondition and 409 against itself. Verified against the live column types, not assumed.
 */
import { sql } from 'drizzle-orm'
import type { PayloadRequest } from 'payload'

/** What every advancing write returns, and what the client must adopt (§4's token rule). */
export type RecoveryToken = {
  generation: number
  revision: number
  updatedAt: string
}

/**
 * The transaction-bound drizzle instance, or the pool when there is no transaction.
 *
 * `db.sessions[txID].db` is the same lookup @payloadcms/drizzle's own (unexported) `getTransaction()`
 * performs — verified against installed source, and the identical idiom `endpoints/userAssignments.ts`
 * already relies on for its `SELECT … FOR UPDATE`. Falling back to `adapter.drizzle` is correct for
 * callers outside a transaction (the expiry job), but is NOT correct for retirement inside save-as-new;
 * that path always has `req.transactionID`.
 */
export const txDb = async (req: PayloadRequest) => {
  const adapter = req.payload.db as unknown as {
    sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }>
    drizzle: { execute: (q: unknown) => Promise<unknown> }
  }
  const id = req.transactionID != null ? String(await req.transactionID) : undefined
  return (id ? adapter.sessions?.[id]?.db : undefined) ?? adapter.drizzle
}

/** `numeric` arrives as a string; anything unparseable is a bug worth failing loudly on. */
const toInt = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n))
    throw new Error(`edit-recovery: non-numeric value from Postgres: ${String(v)}`)
  return n
}

/** drizzle's `execute` returns a driver-shaped result; both shapes appear across versions. */
const rowsOf = (result: unknown): Record<string, unknown>[] => {
  const r = result as { rows?: Record<string, unknown>[] } | Record<string, unknown>[]
  return Array.isArray(r) ? r : (r?.rows ?? [])
}

const tokenOf = (row: Record<string, unknown>): RecoveryToken => ({
  generation: toInt(row.generation),
  revision: toInt(row.revision),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
})

/**
 * `start` — the ONLY path that inserts or reactivates a row. One statement (§4).
 *
 * **On an already-active row this is a total no-op that merely reports state.** It fires on every Edit
 * click and in every tab, so any mutation on the resume path would be a write, and a write invalidates
 * the preconditions other tabs are holding. An earlier version of this SQL incremented `revision`
 * unconditionally and thereby broke both cases it was written for: two first starts returned (1,1) and
 * (1,2), so the first caller's token was stale before it was used and its first capture would 409
 * against a conflict that never existed.
 *
 * Reactivating a RETIRED row is the opposite: it advances the generation (fencing out any stale tab
 * holding the old one), takes a FRESH baseline and schema version (or the new session would compare
 * staleness against the retired session's baseline), and restarts the TTL clock.
 *
 * `updated_at` is set explicitly on every branch. Payload maintains that column in its own update path
 * and the `DEFAULT now()` fires only on INSERT — there is no trigger — so raw SQL that omitted it would
 * leave a reactivated row carrying its retirement-era timestamp, and the next expiry run would destroy
 * the session seconds after it began. Resume deliberately PRESERVES it: the TTL measures the age of the
 * captured content, not of the session, so resuming a 29-day-old capture and typing nothing can still
 * let it expire (§4).
 *
 * `lessonPlan`, `baseUpdatedAt` and `schemaVersion` are derived by the CALLER from the authorized
 * source version and never accepted from the client: a client-supplied `baseUpdatedAt` would defeat the
 * staleness guard by asserting the source had not moved, `schemaVersion` would defeat the shape guard
 * identically, and `lessonPlan` would file the row under a plan the caller may hold no rights to.
 */
export const start = async (
  req: PayloadRequest,
  args: {
    userId: number
    sourceVersionId: number
    lessonPlanId: number
    /** The SOURCE's `updatedAt`, read server-side from the version this caller was authorized against. */
    sourceUpdatedAt: string
    schemaVersion: string
  },
): Promise<RecoveryToken> => {
  const db = await txDb(req)
  const result = await db.execute(sql`
    INSERT INTO edit_recovery
      (user_id, source_version_id, lesson_plan_id, generation, revision,
       base_updated_at, schema_version, content, updated_at, created_at)
    VALUES
      (${args.userId}, ${args.sourceVersionId}, ${args.lessonPlanId}, 1, 1,
       ${args.sourceUpdatedAt}::timestamptz, ${args.schemaVersion}, NULL, NOW(), NOW())
    ON CONFLICT (user_id, source_version_id) DO UPDATE SET
      generation = edit_recovery.generation
                 + (CASE WHEN edit_recovery.retired_at IS NULL THEN 0 ELSE 1 END),
      revision   = CASE WHEN edit_recovery.retired_at IS NULL
                        THEN edit_recovery.revision
                        ELSE edit_recovery.revision + 1 END,
      base_updated_at = CASE WHEN edit_recovery.retired_at IS NULL
                             THEN edit_recovery.base_updated_at
                             ELSE EXCLUDED.base_updated_at END,
      schema_version  = CASE WHEN edit_recovery.retired_at IS NULL
                             THEN edit_recovery.schema_version
                             ELSE EXCLUDED.schema_version END,
      updated_at = CASE WHEN edit_recovery.retired_at IS NULL
                        THEN edit_recovery.updated_at
                        ELSE NOW() END,
      retired_at = NULL
    RETURNING generation, revision, updated_at
  `)

  const row = rowsOf(result)[0]
  if (!row) throw new Error('edit-recovery: start returned no row')
  return tokenOf(row)
}
