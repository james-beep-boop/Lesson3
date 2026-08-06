/**
 * Edit-recovery persistence kernel (design §4) — the atomic statements, with no HTTP around them.
 *
 * Everything here is raw SQL for one reason: each operation must be a SINGLE statement whose
 * preconditions are evaluated *inside* the write. A read-then-write through the Local API cannot do
 * that — two tabs both read, both pass, and the later write silently drops the earlier one. The
 * fencing protocol is only worth anything if it is atomic, so it lives at the SQL level and is tested
 * against a real database rather than reasoned about.
 *
 * ⚑ **Every statement runs on the REQUEST'S transaction**, via `txDb` from `lib/txDb.ts` — which
 * fails closed rather than falling back to the pool. Retirement joins the save-as-new transaction
 * inside its semver retry (§4), so a statement that quietly ran on the pool instead would commit
 * independently of the save it is supposed to be part of — retiring a capture for a save that then
 * rolled back, which is exactly the work-destroying outcome this feature exists to prevent.
 *
 * `generation` and `revision` are `numeric` columns, so every value read back goes through `toInt`
 * (`toPositiveInt`, same module): node-postgres returns `numeric` as a STRING, and an unnormalised `revision` would
 * compare `'2' !== 2` in a CAS precondition and 409 against itself.
 */
import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import { rowsOf, toPositiveInt, txDb } from '../txDb'
import { projectCapture } from './projection'

/** What every advancing write returns, and what the client must adopt (§4's token rule). */
export type RecoveryToken = {
  generation: number
  revision: number
  updatedAt: string
}

/**
 * `updated_at` is normalised through whichever shape the driver hands back.
 *
 * ⚑ Measured, because the obvious reasoning is wrong in BOTH directions. A raw `pg.Client` parses
 * `timestamptz` into a JS `Date`, and `String(date)` renders `"Thu Aug 06 2026 01:14:12 GMT+0000 (…)"`
 * — a format with NO milliseconds, so stringifying first would silently truncate every token to
 * `.000Z`. But **drizzle's pool returns this column as a STRING** (`"2026-08-06 01:18:14.61+00"`),
 * where `String()` is a no-op and the milliseconds survive. So the truncation does not happen on this
 * path today: verified by querying through `payload.db.drizzle` rather than through `pg` directly,
 * which is the check that distinguishes the two.
 *
 * The `Date` branch is therefore DEFENSIVE, not a live fix. It costs one `instanceof` and removes the
 * dependency on a driver-configuration detail that nothing in this repo pins — a type-parser change,
 * or a caller passing a handle configured differently, would otherwise start truncating tokens with
 * no test able to see it. The `NaN` guard is the same argument: a token is a value the client echoes
 * back, so a wrong one propagates everywhere it is compared.
 */
const tokenOf = (row: Record<string, unknown>): RecoveryToken => {
  const raw = row.updated_at
  const updatedAt = raw instanceof Date ? raw : new Date(String(raw))
  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error(`edit-recovery: unparseable updated_at: ${String(raw)}`)
  }
  return {
    generation: toPositiveInt(row.generation),
    revision: toPositiveInt(row.revision),
    updatedAt: updatedAt.toISOString(),
  }
}

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
      revision   = edit_recovery.revision
                 + (CASE WHEN edit_recovery.retired_at IS NULL THEN 0 ELSE 1 END),
      base_updated_at = CASE WHEN edit_recovery.retired_at IS NULL
                             THEN edit_recovery.base_updated_at
                             ELSE EXCLUDED.base_updated_at END,
      schema_version  = CASE WHEN edit_recovery.retired_at IS NULL
                             THEN edit_recovery.schema_version
                             ELSE EXCLUDED.schema_version END,
      updated_at = CASE WHEN edit_recovery.retired_at IS NULL
                        THEN edit_recovery.updated_at
                        ELSE NOW() END,
      -- Reactivation establishes its OWN fresh-session invariant rather than trusting that whoever
      -- retired the row cleared its content. Retirement does clear it, so this is belt-and-braces —
      -- but the failure it guards is that a new session opens showing the PREVIOUS session's text as
      -- if it were recoverable work, and that is not a failure worth leaving to another function's
      -- correctness. Resume preserves content, because resume is a no-op.
      content = CASE WHEN edit_recovery.retired_at IS NULL
                     THEN edit_recovery.content
                     ELSE NULL END,
      retired_at = NULL
    RETURNING generation, revision, updated_at
  `)

  const row = rowsOf(result)[0]
  if (!row) throw new Error('edit-recovery: start returned no row')
  return tokenOf(row)
}

/**
 * Hard per-capture ceiling on the serialised content (§5). Enforced HERE rather than at the endpoint
 * so no caller can store past it by forgetting: this module is the storage boundary, and "checked
 * before storage" is only a guarantee if the check cannot be routed around. Sized for a whole
 * sub-strand's prose with room to spare — a bundle that legitimately exceeds this is a bug worth
 * seeing, not a limit worth raising silently.
 */
export const MAX_CAPTURE_BYTES = 512 * 1024

/**
 * The outcomes a capture can have. A discriminated union rather than `null`, because the caller must
 * distinguish "your token is stale, refetch" (409) from "this content is too big, stop retrying with
 * it" (413) — retrying an oversized capture forever is the failure a bare null invites.
 */
export type CaptureResult =
  | { ok: true; token: RecoveryToken }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'too-large'; bytes: number }

/**
 * `capture` — a compare-and-set UPDATE of an EXISTING ACTIVE row. **Never an insert.**
 *
 * ⚑ This statement, not the unique index, is what enforces "capture never inserts". The index only
 * enforces one row per `(user, sourceVersion)` and gives `start` its conflict target; a capture that
 * INSERTed when no row existed would satisfy it perfectly, and the explicit-start step would have been
 * silently optional. Calling this an "upsert" — as an earlier revision of the design did — undoes the
 * whole protocol, because an upserting capture recreates a RETIRED row, which is precisely the
 * resurrection retirement markers exist to prevent (§7 case 15).
 *
 * All four preconditions are evaluated inside the UPDATE, never read-then-written:
 *
 *   - the row exists                    → a capture without a `start` cannot create one
 *   - `retired_at IS NULL`              → resurrection blocked (case 15)
 *   - `generation` matches              → a tab from a superseded session is fenced out
 *   - `revision` matches `expectedRevision` → another tab's newer work is never overwritten
 *
 * Zero rows updated means one of those failed, and they are deliberately NOT distinguished: telling a
 * caller which preconditions failed would leak whether another session exists for a row it is not
 * allowed to read. The client's response is the same either way — refetch.
 *
 * On success the ADVANCED token is returned and the client must adopt it (§4's token rule). Returning
 * the token the caller SENT would leave it holding a value the successful write just superseded, so
 * its next capture would 409 against a conflict it caused itself.
 *
 * ⚑ **This function PROJECTS; it does not accept a capture map.** It takes the raw form document and
 * runs `projectCapture` itself, so the prose whitelist is enforced at the same boundary as the byte
 * cap. An earlier signature took pre-projected `content: unknown` and stored it verbatim — which made
 * the whitelist a convention a caller could simply not follow, letting `resourceLinks`, `phase`,
 * `rubric`, answer keys or arbitrary JSON reach the column. A boundary that depends on every caller
 * remembering is not a boundary; the projection is therefore not skippable from here.
 */
export const capture = async (
  req: PayloadRequest,
  args: {
    userId: number
    sourceVersionId: number
    generation: number
    expectedRevision: number
    /**
     * The RAW form document, not a capture map. Projected here, so what is measured is exactly what
     * is stored and nothing outside the prose whitelist can reach the column.
     */
    formDocument: unknown
  },
): Promise<CaptureResult> => {
  const projected = projectCapture(args.formDocument as Record<string, unknown> | null)
  const json = JSON.stringify(projected)
  const bytes = Buffer.byteLength(json, 'utf8')
  if (bytes > MAX_CAPTURE_BYTES) return { ok: false, reason: 'too-large', bytes }

  const db = await txDb(req)
  const result = await db.execute(sql`
    UPDATE edit_recovery SET
      content    = ${json}::jsonb,
      revision   = edit_recovery.revision + 1,
      updated_at = NOW()
    WHERE user_id = ${args.userId}
      AND source_version_id = ${args.sourceVersionId}
      AND retired_at IS NULL
      AND generation = ${args.generation}
      AND revision = ${args.expectedRevision}
    RETURNING generation, revision, updated_at
  `)

  const row = rowsOf(result)[0]
  return row ? { ok: true, token: tokenOf(row) } : { ok: false, reason: 'conflict' }
}
