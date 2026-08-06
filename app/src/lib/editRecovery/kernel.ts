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
 * (`toPositiveInt`, `lib/txDb.ts`): node-postgres returns `numeric` as a STRING, and an unnormalised `revision` would
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
/**
 * Per-user ceiling on ACTIVE captures (SPEC §5). Approximate by design — see `start`.
 *
 * §5 states two caps in one sentence: this one and the per-capture byte ceiling. They live at the same
 * altitude for the same reason — `start` is the only path that inserts a row, so it is the storage
 * boundary for row COUNT exactly as `capture` is for row SIZE.
 */
export const MAX_ACTIVE_CAPTURES = 20

export type StartResult =
  | { ok: true; token: RecoveryToken }
  /**
   * The user already holds {@link MAX_ACTIVE_CAPTURES} active captures. A VALUE, not a throw: being at
   * capacity is a condition the system chose, and throwing would surface it to a teacher as a 500.
   */
  | { ok: false; reason: 'at-capacity' }

export const start = async (
  req: PayloadRequest,
  args: {
    userId: number
    sourceVersionId: number
    lessonPlanId: number
    /** The SOURCE's `updatedAt`, read server-side from the version this caller was authorized against. */
    sourceUpdatedAt: string
    schemaVersion: string
    /** Test seam only; production uses {@link MAX_ACTIVE_CAPTURES}. Not reachable over the wire. */
    maxActive?: number
  },
): Promise<StartResult> => {
  const db = await txDb(req)
  const cap = args.maxActive ?? MAX_ACTIVE_CAPTURES
  const result = await db.execute(sql`
    WITH active AS (
      -- ⚑ Scoped BOTH ways, and each scope has its own silent failure. Without the user_id scope, one prolific
      -- editor caps everybody; without the retired_at IS NULL scope, tombstones count, so anyone who has ever
      -- edited 20 plans is locked out forever with zero live sessions.
      SELECT COUNT(*)::int AS n FROM edit_recovery
      WHERE user_id = ${args.userId} AND retired_at IS NULL
    )
    INSERT INTO edit_recovery
      (user_id, source_version_id, lesson_plan_id, generation, revision,
       base_updated_at, schema_version, content, updated_at, created_at)
    SELECT
      ${args.userId}, ${args.sourceVersionId}, ${args.lessonPlanId}, 1, 1,
      ${args.sourceUpdatedAt}::timestamptz, ${args.schemaVersion}, NULL, NOW(), NOW()
    FROM active
    -- The INSERT must still be ATTEMPTED when a row already exists for this pair, or the ON CONFLICT
    -- below never fires and RESUME would be refused at capacity — which is the one thing the cap must
    -- never do (a teacher at the cap could not reopen work they already have).
    WHERE active.n < ${cap}
       OR EXISTS (
            SELECT 1 FROM edit_recovery
            WHERE user_id = ${args.userId} AND source_version_id = ${args.sourceVersionId}
          )
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
    -- RESUME is always allowed; REACTIVATION begins a new session, so it counts against the cap.
    WHERE edit_recovery.retired_at IS NULL OR (SELECT n FROM active) < ${cap}
    RETURNING generation, revision, updated_at
  `)

  const row = rowsOf(result)[0]
  // No row means the cap refused it — either the INSERT was gated out (a new pair) or the DO UPDATE's
  // WHERE was false (reactivating at capacity). There is no other way to reach zero rows here: the
  // pair is unique, so the statement either inserts, updates, or is refused.
  return row ? { ok: true, token: tokenOf(row) } : { ok: false, reason: 'at-capacity' }
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

/**
 * The four callers of retirement, as a DISCRIMINATED UNION (design §8).
 *
 * They agree entirely on what they WRITE — that is the one shared `SET` below — and differ only in
 * what they must PROVE first. Those proofs are not interchangeable, and modelling them as optional
 * fields on one shape would let expiry omit its `cutoff` and retire a session someone is typing into.
 * Under a union that is a type error.
 *
 * ⚑ The transaction requirement is NOT expressible here, and claiming otherwise would be false
 * assurance: a union constrains the command's FIELDS, not the `req` handed alongside it.
 * `by: 'save-as-new'` selects `requireTransaction` internally, so no call site can forget the flag —
 * but a caller passing a transaction-less `req` is caught at runtime by `txDb`, not by `tsc`. Case 19
 * (the rollback test) is what actually pins it, and has to exist regardless.
 */
export type RetireCommand =
  /** The save succeeded, so the capture's job is done. MUST run inside the save's transaction. */
  | { by: 'save-as-new'; generation: number; expectedRevision: number }
  /** The user rejected the restore offer. Same precondition, no transaction requirement. */
  | { by: 'discard'; generation: number; expectedRevision: number }
  /** Site Admin, carrying the revision `recovery/meta` reported — so an operator cannot clear a
   *  capture that changed between looking and acting. No generation: an admin has no session. */
  | { by: 'admin-cleanup'; expectedRevision: number }
  /** The 30-day job, carrying the revision it selected AND the cutoff it selected against. */
  | { by: 'expiry'; expectedRevision: number; cutoff: Date }

export type RetireResult = { ok: true; token: RecoveryToken } | { ok: false; reason: 'conflict' }

/**
 * `retire` — the ONE shared retirement transition (§4). Four callers, one `SET`.
 *
 * Writes `content := NULL`, `retiredAt := now`, `updatedAt := now`, `revision += 1`.
 *
 * ⚑ **It does NOT advance the generation** (SPEC §5, amended 2026-08-06). `revision` fences concurrent
 * WRITES and moves on every write including this one; `generation` identifies the active editing
 * SESSION and moves only when a new one BEGINS, which is reactivation's job inside `start`. Advancing
 * it here too would move it twice per retire-then-reactivate cycle, and §7 case 22 asserts a single
 * advance across exactly that cycle.
 *
 * **None hard-delete.** The row survives as that pair's retirement marker, which is what makes a
 * stale tab's capture refusable rather than merely unmatched — see `capture`'s `retired_at IS NULL`.
 *
 * Every precondition is evaluated INSIDE the update. A read-then-write would let two callers both
 * read a matching revision and both proceed, and the second would retire work the first had already
 * accounted for. Zero rows updated means some precondition failed; as with `capture` they are
 * deliberately not disambiguated, since saying which one would leak whether another session exists.
 *
 * Targeting is by `(userId, sourceVersionId)` for all four rather than by row id — the compound unique
 * index makes that exactly one row, and it keeps one target shape instead of two. Expiry passes the
 * pair from the row it selected.
 */
export const retire = async (
  req: PayloadRequest,
  target: { userId: number; sourceVersionId: number },
  command: RetireCommand,
): Promise<RetireResult> => {
  // Only save-as-new demands a live transaction: it is the caller whose retirement must roll back
  // with the save it belongs to. Expiry is a background job with no transaction at all, and that is
  // correct for it.
  const db = await txDb(req, { requireTransaction: command.by === 'save-as-new' })

  // The generation term applies only where the caller HAS a session to prove. An admin acting from
  // the metadata endpoint has none, and expiry is a job — for those, the revision is the whole proof.
  const generationTerm =
    command.by === 'save-as-new' || command.by === 'discard'
      ? sql` AND generation = ${command.generation}`
      : sql``

  // Expiry alone adds "still untouched since the cutoff". This term ALREADY defeats the race on its
  // own — every advancing write sets `updated_at = NOW()`, so a capture landing mid-job pushes the row
  // out of the window — and the revision term is defence in depth. Both are kept so expiry's safety is
  // self-contained rather than contingent on an invariant maintained in four other places (§4).
  const cutoffTerm =
    command.by === 'expiry'
      ? sql` AND updated_at < ${command.cutoff.toISOString()}::timestamptz`
      : sql``

  const result = await db.execute(sql`
    UPDATE edit_recovery SET
      content    = NULL,
      retired_at = NOW(),
      updated_at = NOW(),
      revision   = edit_recovery.revision + 1
    WHERE user_id = ${target.userId}
      AND source_version_id = ${target.sourceVersionId}
      AND retired_at IS NULL
      AND revision = ${command.expectedRevision}${generationTerm}${cutoffTerm}
    RETURNING generation, revision, updated_at
  `)

  const row = rowsOf(result)[0]
  return row ? { ok: true, token: tokenOf(row) } : { ok: false, reason: 'conflict' }
}

/** SPEC §5: captures are retained 30 days from last touch. */
export const CAPTURE_TTL_DAYS = 30

/** Bounded per run, so one job cannot hold a connection open across an unbounded backlog. */
export const EXPIRY_BATCH_LIMIT = 500

export type ExpiryReport = {
  /** Rows this run actually retired. */
  retired: number
  /**
   * Rows selected as expired whose retirement then conflicted — a capture or a reactivation won the
   * race. NOT an error: it is the fencing working, and the row simply is not expired any more. A job
   * that reported this as a failure would train operators to ignore its output.
   */
  skipped: number
}

/**
 * The 30-day expiry pass (design §4/§5; §7 cases 25 and 30).
 *
 * A Payload job rather than SQL in `scripts/prune-db.sh`, because it must share the ONE retirement
 * transition — a second implementation would be free to drift from what "retired" means.
 *
 * ⚑ **Select, then compare-and-set per row.** The selection is a plain read, so anything it returns
 * may be stale by the time the update runs. `retire({ by: 'expiry' })` carries both the revision this
 * pass read AND the cutoff it selected against, and evaluates them inside the UPDATE — so a capture
 * that lands in between conflicts and the row is left alone. The cutoff term alone already defeats
 * that race (every advancing write sets `updated_at = NOW()`), and the revision is defence in depth.
 *
 * ⚑ **Tombstones are excluded by the selection, not by the update.** `retired_at IS NULL` in the
 * WHERE below is what stops the job re-stamping markers on every run forever — the retirement
 * statement would refuse them anyway, but they would be selected, attempted and counted as skipped
 * on every pass, which is a slow leak of work that looks like normal operation.
 *
 * Each row is retired independently. One conflicting row must not roll back the rest, so there is no
 * enclosing transaction — which is also why `retire` does not demand one for this caller.
 */
/** One row the selection chose, carrying the revision it was chosen with. */
export type ExpiryCandidate = { userId: number; sourceVersionId: number; revision: number }

/**
 * The SELECT half of the pass, split out from the retirement half.
 *
 * ⚑ The split is not decoration: it is what makes the conflict path TESTABLE. Within one
 * `expireCaptures` call the SELECT and each UPDATE are adjacent, so nothing can move between them and
 * the `skipped` branch is unreachable — a test that claimed to cover it was really covering nothing,
 * and a flip that broke the branch stayed green. Exposing the two halves lets a test select, then
 * change the world, then retire, which is exactly the interleaving production hits under concurrency.
 *
 * Preferred over a test-only callback inside `expireCaptures`: this is a real decomposition the job
 * itself composes, not a seam that exists solely for tests to reach through.
 */
export const selectExpiredCaptures = async (
  req: PayloadRequest,
  opts: { cutoff: Date; limit?: number },
): Promise<ExpiryCandidate[]> => {
  const db = await txDb(req)
  const rows = rowsOf(
    await db.execute(sql`
      SELECT user_id, source_version_id, revision
      FROM edit_recovery
      WHERE retired_at IS NULL
        AND updated_at < ${opts.cutoff.toISOString()}::timestamptz
      ORDER BY updated_at ASC
      LIMIT ${opts.limit ?? EXPIRY_BATCH_LIMIT}
    `),
  )
  return rows.map((row) => ({
    userId: toPositiveInt(row.user_id),
    sourceVersionId: toPositiveInt(row.source_version_id),
    revision: toPositiveInt(row.revision),
  }))
}

/**
 * The retirement half: each candidate independently, carrying the revision it was SELECTED with and
 * the cutoff it was selected against, both evaluated inside the UPDATE.
 *
 * A candidate whose row moved since selection conflicts and is counted as `skipped`, not raised — the
 * fencing worked and the row simply is not expired any more. One conflicting row must not stop the
 * batch, so there is no enclosing transaction; that is also why `retire` does not demand one here.
 */
export const retireSelected = async (
  req: PayloadRequest,
  candidates: ExpiryCandidate[],
  cutoff: Date,
): Promise<ExpiryReport> => {
  const report: ExpiryReport = { retired: 0, skipped: 0 }
  for (const candidate of candidates) {
    const result = await retire(
      req,
      { userId: candidate.userId, sourceVersionId: candidate.sourceVersionId },
      { by: 'expiry', expectedRevision: candidate.revision, cutoff },
    )
    if (result.ok) report.retired += 1
    else report.skipped += 1
  }
  return report
}

/**
 * The 30-day expiry pass (design §4/§5; §7 cases 25 and 30) — select, then compare-and-set per row.
 *
 * The selection is a plain read, so anything it returns may be stale by the time the update runs.
 * `retire({ by: 'expiry' })` carries both the revision this pass read AND the cutoff it selected
 * against, and evaluates them inside the UPDATE — so a capture landing in between conflicts and the
 * row is left alone. The cutoff term alone already defeats that race (every advancing write sets
 * `updated_at = NOW()`); the revision is defence in depth.
 *
 * ⚑ Tombstones are excluded by the SELECTION, not merely refused by the update. Without
 * `retired_at IS NULL` they would be re-selected on every run forever, attempted, refused, and counted
 * as skipped — a permanent growing cost that never surfaces as an error.
 */
export const expireCaptures = async (
  req: PayloadRequest,
  opts: { cutoff: Date; limit?: number } = {
    cutoff: new Date(Date.now() - CAPTURE_TTL_DAYS * 86_400_000),
  },
): Promise<ExpiryReport> => retireSelected(req, await selectExpiredCaptures(req, opts), opts.cutoff)

/** What the restore prompt needs: the stored capture plus the token to act on it. */
export type ActiveCapture = {
  token: RecoveryToken
  content: unknown
  /** The source's `updatedAt` when this session began — a mismatch means view/copy only. */
  baseUpdatedAt: string
  /** The field shape the capture was taken under — a mismatch means view/copy only. */
  schemaVersion: string
}

/**
 * Read the caller's ACTIVE capture for a source, or null.
 *
 * Scoped to `(userId, sourceVersionId)` with `retired_at IS NULL`. The user id comes from the session
 * at the endpoint, never from the request body — that is what makes "a different user on the same
 * browser sees nothing" (SPEC §13, matrix case 5) structural rather than a check someone could omit.
 *
 * Tombstones return null: a retirement marker exists to fence resurrection, not to be shown to anyone.
 */
export const readActiveCapture = async (
  req: PayloadRequest,
  args: { userId: number; sourceVersionId: number },
): Promise<ActiveCapture | null> => {
  const db = await txDb(req)
  const row = rowsOf(
    await db.execute(sql`
      SELECT generation, revision, updated_at, content, base_updated_at, schema_version
      FROM edit_recovery
      WHERE user_id = ${args.userId}
        AND source_version_id = ${args.sourceVersionId}
        AND retired_at IS NULL
    `),
  )[0]
  if (!row) return null
  return {
    token: tokenOf(row),
    content: row.content ?? null,
    baseUpdatedAt: new Date(String(row.base_updated_at)).toISOString(),
    schemaVersion: String(row.schema_version),
  }
}

/** One row's metadata for the Site-Admin view. ⚑ Deliberately has NO `content` field. */
export type CaptureMetadata = {
  userId: number
  revision: number
  updatedAt: string
  retiredAt: string | null
  /** Serialised size, so an operator can see a large capture without reading it. */
  bytes: number
}

/**
 * Site-Admin metadata for every capture on a source — existence and shape, NEVER content (SPEC §13).
 *
 * ⚑ The `content` column is not selected at all, rather than selected and then stripped. A projection
 * that fetches the prose and deletes it before returning is one careless edit away from leaking it,
 * and it would put a teacher's unsaved work in the process memory of a request that has no business
 * holding it. `pg_column_size` gives the operator the one thing about the content they legitimately
 * need — how big it is — without reading a character of it.
 */
export const readCaptureMetadata = async (
  req: PayloadRequest,
  args: { sourceVersionId: number },
): Promise<CaptureMetadata[]> => {
  const db = await txDb(req)
  const rows = rowsOf(
    await db.execute(sql`
      SELECT user_id, revision, updated_at, retired_at,
             COALESCE(pg_column_size(content), 0) AS bytes
      FROM edit_recovery
      WHERE source_version_id = ${args.sourceVersionId}
      ORDER BY updated_at DESC
    `),
  )
  return rows.map((row) => ({
    userId: toPositiveInt(row.user_id),
    revision: toPositiveInt(row.revision),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    retiredAt: row.retired_at ? new Date(String(row.retired_at)).toISOString() : null,
    bytes: Number(row.bytes ?? 0),
  }))
}
