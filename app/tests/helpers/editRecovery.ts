/**
 * Shared fixture plumbing for the `edit-recovery` int specs.
 *
 * These were duplicated across `editRecoveryStart` and `editRecoveryCapture` — and had already drifted
 * into a trap: `rawRow(userId, versionId)` in one file was `rawRow(versionId, userId)` in the other,
 * the same name with swapped parameters in sibling specs. One signature convention lives here:
 * **`(payload, versionId, userId)`**, always in that order.
 *
 * `retireDirectly` is the one worth centralising even beyond the duplication. It hand-writes what
 * retirement does, ahead of the shared retirement function; when that lands, this must be deleted and
 * its callers repointed. One copy is one deletion. Two copies invite one being missed, and a leftover
 * would then silently disagree with the real implementation about what retirement writes.
 *
 * All statements go through `drizzleOf` (helpers/db.ts — "the one definition new code should use"),
 * NOT through the production `txDb`. Routing fixture SQL through the code under test would couple
 * setup to `txDb`'s pool-fallback branch, so hardening that branch would break specs that are not
 * about it.
 */
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { drizzleOf } from './db.js'
import { MARK, minimalBundleContent } from './fixtures.js'

const rows = (result: unknown): Record<string, unknown>[] => {
  const r = result as { rows?: Record<string, unknown>[] } | Record<string, unknown>[]
  return Array.isArray(r) ? r : (r?.rows ?? [])
}

/** A non-Official sibling version, so it can be deleted (the Official one is protected). */
export async function makeRecoveryVersion(
  payload: Payload,
  args: { planId: number; subjectGradeId: number; sourceVersionId: number; semver: string },
) {
  return payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: args.planId,
      subjectGrade: args.subjectGradeId,
      semver: args.semver,
      sourceVersion: args.sourceVersionId,
      title: `${MARK}ER-${args.semver}`,
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
 * Retire a row directly. ⚑ TEMPORARY — delete this and repoint callers at the shared retirement
 * function the moment it lands, or this copy will drift from the real definition of "retired".
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
