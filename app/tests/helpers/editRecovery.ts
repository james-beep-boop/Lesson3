/**
 * Shared fixture plumbing for the `edit-recovery` int specs.
 *
 * These were duplicated across `editRecoveryStart` and `editRecoveryCapture` — and had already drifted
 * into a trap: `rawRow(userId, versionId)` in one file was `rawRow(versionId, userId)` in the other,
 * the same name with swapped parameters in sibling specs. One signature convention lives here:
 * **`(payload, versionId, userId)`**, always in that order.
 *
 * `retireDirectly` hand-writes what retirement does. It was written ahead of the shared `retire()` and
 * this header used to promise its deletion once that landed — `retire()` has landed, and the helper is
 * KEPT deliberately. Its own docblock carries the reason (setup must not run through the function
 * under test); the point here is only that one copy exists rather than one per spec.
 *
 * All statements go through `drizzleOf` (helpers/db.ts — "the one definition new code should use"),
 * NOT through the production `txDb`. Routing fixture SQL through the code under test would couple
 * setup to `txDb`'s pool-fallback branch, so hardening that branch would break specs that are not
 * about it.
 */
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { PayloadRequest } from 'payload'

import { drizzleOf } from './db.js'
import { MARK, minimalBundleContent, type RoleFixture } from './fixtures.js'
import {
  capture,
  start,
  type CaptureResult,
  type RecoveryToken,
  type StartResult,
} from '../../src/lib/editRecovery/kernel.js'

const rows = (result: unknown): Record<string, unknown>[] => {
  const r = result as { rows?: Record<string, unknown>[] } | Record<string, unknown>[]
  return Array.isArray(r) ? r : (r?.rows ?? [])
}

/** A non-Official sibling version, so it can be deleted (the Official one is protected). */
export async function makeRecoveryVersion(
  payload: Payload,
  args: {
    planId: number
    subjectGradeId: number
    sourceVersionId: number
    semver: string
    /** Distinguishes one spec's candidates from another's in the shared fixture. */
    titlePrefix?: string
  },
) {
  return payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: args.planId,
      subjectGrade: args.subjectGradeId,
      semver: args.semver,
      sourceVersion: args.sourceVersionId,
      title: `${MARK}${args.titlePrefix ?? 'ER-'}${args.semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })
}

/** The stored row, so assertions see what is in the table rather than what a helper reported. */
export async function recoveryRow(payload: Payload, versionId: number, userId: number) {
  return rows(
    await drizzleOf(payload).execute(sql`
      SELECT id, generation, revision, retired_at, base_updated_at, schema_version, content, updated_at
      FROM edit_recovery WHERE user_id = ${userId} AND source_version_id = ${versionId}
    `),
  )[0]
}

export async function countRecoveryRows(payload: Payload, versionId: number, userId: number) {
  return Number(
    rows(
      await drizzleOf(payload).execute(sql`
        SELECT COUNT(*)::int AS n FROM edit_recovery
        WHERE user_id = ${userId} AND source_version_id = ${versionId}
      `),
    )[0]?.n,
  )
}

/**
 * Retire a row directly, with raw SQL rather than the kernel's `retire()`.
 *
 * ⚑ This was marked TEMPORARY, to be deleted "the moment the shared retirement function lands". It has
 * landed — and the marker was wrong, so it is replaced with the actual reason rather than left to rot.
 *
 * `capture`'s resurrection tests (§7 case 15) exist to prove that a capture cannot revive a RETIRED
 * row. If they reached that state by calling `retire()`, a bug in `retire` could produce a row that is
 * not really retired and case 15 would pass vacuously — a test whose setup depends on the correctness
 * of a sibling under test cannot fail for the reason it claims. The same argument applies to `start`'s
 * reactivation cases.
 *
 * The cost is real and worth naming: this is a SECOND definition of what retirement writes. It is kept
 * deliberately minimal and MUST be checked against `retire()`'s `SET` whenever that changes — the
 * shared-transition test in `editRecoveryRetire.int.spec.ts` is what pins the real one.
 */
export async function retireDirectly(payload: Payload, versionId: number, userId: number) {
  await drizzleOf(payload).execute(sql`
    UPDATE edit_recovery SET retired_at = NOW(), content = NULL,
      revision = revision + 1, updated_at = NOW()
    WHERE user_id = ${userId} AND source_version_id = ${versionId}
  `)
}

/**
 * Push `updated_at` into the past, so a write that is supposed to restart the TTL clock has to
 * visibly move it. Without ageing, a `>=` assertion passes even when the write does not touch the
 * column at all — the guarantee looks tested and is not.
 */
export async function ageRecoveryRow(
  payload: Payload,
  versionId: number,
  userId: number,
  seconds = 60,
) {
  await drizzleOf(payload).execute(sql`
    UPDATE edit_recovery SET updated_at = NOW() - (${seconds} * INTERVAL '1 second')
    WHERE user_id = ${userId} AND source_version_id = ${versionId}
  `)
}

/**
 * Retire EVERY active capture a user holds, across all sources.
 *
 * The active-capture cap counts per user and globally, so tests that exercise it accumulate: without
 * a reset, the second test in a file starts already at capacity and its seeding fails for a reason
 * that has nothing to do with what it is testing.
 */
export async function retireAllActiveFor(payload: Payload, userId: number) {
  await drizzleOf(payload).execute(sql`
    UPDATE edit_recovery SET retired_at = NOW(), content = NULL,
      revision = revision + 1, updated_at = NOW()
    WHERE user_id = ${userId} AND retired_at IS NULL
  `)
}

/** Overwrite a row's stored capture. Fixture setup for states the kernel would never produce. */
export async function setRecoveryContent(
  payload: Payload,
  versionId: number,
  userId: number,
  content: unknown,
) {
  await drizzleOf(payload).execute(sql`
    UPDATE edit_recovery SET content = ${JSON.stringify(content)}::jsonb
    WHERE user_id = ${userId} AND source_version_id = ${versionId}
  `)
}

/**
 * Pin `updated_at` to an exact instant.
 *
 * Needed because `NOW()` legitimately lands on `.000` about once in a thousand runs, so a test that
 * asserts "milliseconds survived" against a `NOW()` value passes-or-fails by luck. Setting a value
 * whose milliseconds are non-zero by construction makes the assertion deterministic.
 */
export async function setRecoveryUpdatedAt(
  payload: Payload,
  versionId: number,
  userId: number,
  iso: string,
) {
  await drizzleOf(payload).execute(sql`
    UPDATE edit_recovery SET updated_at = ${iso}::timestamptz
    WHERE user_id = ${userId} AND source_version_id = ${versionId}
  `)
}

/**
 * Rewrite a stored capture's PROVENANCE — the two fields the restore path compares against the live
 * source to decide whether the capture may be applied at all.
 *
 * ⚑ Forged directly rather than produced by aging a real session, because the two mismatches this
 * creates are otherwise unreachable in a test: `schema_version` only changes when the field shape
 * itself changes (a future migration), and reproducing a genuine `base_updated_at` drift means saving
 * the source between capture and restore, which is a different case (11) with a different assertion.
 * What matters is only that the client sees a mismatch and refuses to apply it.
 */
export async function setRecoveryProvenance(
  payload: Payload,
  versionId: number,
  userId: number,
  args: { baseUpdatedAt?: string; schemaVersion?: string },
) {
  if (args.baseUpdatedAt !== undefined) {
    await drizzleOf(payload).execute(sql`
      UPDATE edit_recovery SET base_updated_at = ${args.baseUpdatedAt}::timestamptz
      WHERE user_id = ${userId} AND source_version_id = ${versionId}
    `)
  }
  if (args.schemaVersion !== undefined) {
    await drizzleOf(payload).execute(sql`
      UPDATE edit_recovery SET schema_version = ${args.schemaVersion}
      WHERE user_id = ${userId} AND source_version_id = ${versionId}
    `)
  }
}

/**
 * Fixture-bound wrappers for the three recovery specs.
 *
 * Each spec previously re-declared `poolReq`, `makeVersion`, `startFor` and `captureFor` locally, and
 * they had already drifted in the way this file exists to prevent: `startFor`'s SECOND positional
 * parameter was a schema version in one spec and a user id in the other two, so
 * `startFor(v.id, 'sv-2')` meant different things in sibling files. Options objects here, so a new
 * parameter cannot silently change what an existing call means.
 */
export const recoveryHarness = (getFx: () => RoleFixture) => {
  // A THUNK, not the fixture. Specs assign `fx` in `beforeAll`, so a harness built at module load
  // would capture `undefined` — the inline arrow functions this replaces read it lazily, and that
  // laziness was load-bearing rather than incidental.
  const fx = () => getFx()
  /** No transaction, so concurrent callers each get their own pooled connection (cases 21-22). */
  const poolReq = () =>
    ({ payload: fx().payload, transactionID: undefined }) as unknown as PayloadRequest

  const makeVersion = (semver: string) =>
    makeRecoveryVersion(fx().payload, {
      planId: fx().plan.id,
      subjectGradeId: fx().subjectGrade.id,
      sourceVersionId: fx().version.id,
      semver,
    })

  type StartOpts = {
    schemaVersion?: string
    userId?: number
    sourceUpdatedAt?: string
    maxActive?: number
  }

  /** The raw result, for the tests that are ABOUT the active-capture cap. */
  const startResult = (versionId: number, opts: StartOpts = {}): Promise<StartResult> =>
    start(poolReq(), {
      userId: opts.userId ?? fx().users.editor.id,
      sourceVersionId: versionId,
      lessonPlanId: fx().plan.id,
      sourceUpdatedAt: opts.sourceUpdatedAt ?? new Date('2026-01-01T00:00:00.000Z').toISOString(),
      schemaVersion: opts.schemaVersion ?? 'sv-1',
      ...(opts.maxActive === undefined ? {} : { maxActive: opts.maxActive }),
    })

  /**
   * The token, unwrapped — for the many tests that are NOT about the cap and would only be made
   * noisier by handling a condition they never provoke. Hitting the cap here is a FIXTURE failure, so
   * it throws with a message that says so rather than returning a value the caller will misread.
   */
  const startFor = async (versionId: number, opts: StartOpts = {}): Promise<RecoveryToken> => {
    const res = await startResult(versionId, opts)
    if (!res.ok) throw new Error(`fixture: start hit the active-capture cap (${res.reason})`)
    return res.token
  }

  /** Takes a FORM DOCUMENT, not a capture map — `capture` projects internally. */
  const captureFor = (
    versionId: number,
    generation: number,
    expectedRevision: number,
    formDocument: unknown,
    userId = fx().users.editor.id,
  ): Promise<CaptureResult> =>
    capture(poolReq(), {
      userId,
      sourceVersionId: versionId,
      generation,
      expectedRevision,
      formDocument,
    })

  const rawRow = (versionId: number, userId = fx().users.editor.id) =>
    recoveryRow(fx().payload, versionId, userId)
  const countRows = (versionId: number, userId = fx().users.editor.id) =>
    countRecoveryRows(fx().payload, versionId, userId)

  return { poolReq, makeVersion, startFor, startResult, captureFor, rawRow, countRows }
}

/** A form document whose lesson row can carry prose plus any admin/system fields a test needs. */
export const formDoc = (title: string, extra: Record<string, unknown> = {}) => ({
  lessons: [{ id: 'L1', title, ...extra }],
})
