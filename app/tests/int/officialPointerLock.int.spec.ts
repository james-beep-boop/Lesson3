/**
 * The Official-pointer lock: both sides of a promotion/delete race must WAIT on the plan row
 * (SPEC §7; the lock and the full race narrative live at `enforceOfficialNotDeletable` in
 * `src/hooks/bundleVersion.ts`).
 *
 * THE BUG THIS GUARDS, with no attacker and no operator error — two authorized admins:
 *
 *   1. A deletes version V. `enforceOfficialNotDeletable` reads the plan's pointer, sees W, and
 *      allows the delete because V ≠ W.
 *   2. B promotes V. The pointer moves to V and commits.
 *   3. A's DELETE runs. `lesson_plans.official_version_id` is `ON DELETE SET NULL` (verified against
 *      the live schema, not assumed), so the pointer B just set is nulled.
 *
 * The plan then has NO Official version: it disappears from the library (which lists plans via their
 * Official version) and the snapshot B approved is gone. Both halves are a read-then-write over the
 * same row in separate transactions, and step 1's read is the vulnerable one — a plain `SELECT`
 * under READ COMMITTED does not block on another transaction's uncommitted `UPDATE`, it returns the
 * OLD value.
 *
 * ⚑ WHY THIS SPEC ASSERTS *WAITING* RATHER THAN REPLAYING THE FULL RACE. Two earlier versions of
 * this file drove the real operations concurrently and BOTH passed with the lock reverted — they
 * were guesses, not guards, and only mutation testing exposed that. The reason is that Postgres
 * already serialises the orderings a test can easily construct: a delete that has taken its row lock
 * makes the promotion block on the foreign key, and a promotion held inside its `UPDATE` has not yet
 * taken the FK's `KEY SHARE` lock, so the delete simply wins outright. The genuinely destructive
 * interleaving needs the delete paused BETWEEN its guard's read and its DML — application time, with
 * no trigger point to hang a barrier on — while the promotion commits inside that gap. Forcing it
 * would take a two-sided barrier reaching into production code.
 *
 * So this spec pins the MECHANISM instead, which is what the fix actually consists of: hold the plan
 * row in an independent transaction, then assert the delete BLOCKS rather than deciding from a stale
 * read. That is deterministic, needs no timing luck, and was watched going red (45 ms — the delete
 * completed instantly) against a reverted lock before being kept. What it does not claim is a
 * reproduction of the original interleaving; `docs/DECISIONS.md` carries that distinction.
 *
 * Requires a DB (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { drizzleOf, rowsOf } from '../helpers/db.js'
import { stillPendingAfterWindow, whileRowLocked } from '../helpers/rowLocks.js'
import type { LessonBundleVersion } from '../../src/payload-types.js'

let fx: RoleFixture

const db = () => drizzleOf(fx.payload)

/** Create a second, NOT-Official version under the fixture plan — the one the race would delete. */
async function makeCandidateVersion(semver: string): Promise<LessonBundleVersion> {
  return (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      title: `${MARK}Pointer-lock candidate ${semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as LessonBundleVersion
}

/** The plan's current pointer, read raw so no hook or access rule can colour the answer. */
async function officialVersionId(): Promise<number | null> {
  const rows = rowsOf<{ official_version_id: number | null }>(
    await db().execute(sql`SELECT official_version_id FROM "lesson_plans" WHERE id = ${fx.plan.id}`),
  )
  const raw = rows[0]?.official_version_id
  return raw == null ? null : Number(raw)
}

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('Official-pointer lock', () => {
  it('makes the version-delete guard WAIT for an in-flight pointer move', async () => {
    const candidate = await makeCandidateVersion('1.0.1')
    expect(await officialVersionId(), 'precondition: the candidate is not Official').toBe(
      Number(fx.version.id),
    )

    let blocked = false
    let deleting!: Promise<unknown>

    await whileRowLocked(fx.payload, 'lesson_plans', fx.plan.id, async () => {
      // `enforceOfficialNotDeletable` must not be able to read the pointer while a promotion holds
      // this row. Unlocked, its plain SELECT returns the stale value and the delete sails through.
      deleting = fx.payload.delete({
        collection: 'lesson-bundle-versions',
        id: candidate.id,
        overrideAccess: true,
      })
      blocked = await stillPendingAfterWindow(deleting)
    })

    expect(
      blocked,
      'the delete must block on the plan row rather than decide from a stale pointer',
    ).toBe(true)

    // Once the holder releases, the delete completes normally — the lock delays, never deadlocks.
    await deleting
    expect(await officialVersionId(), 'the Official pointer is untouched').toBe(Number(fx.version.id))
  }, 60_000)

  /**
   * ⚑ THERE IS NO MATCHING "the promotion blocks" CASE, and its absence is a result rather than an
   * omission. One was written, and it passed with the promotion-side lock reverted — because
   * `payload.update` ends in `UPDATE lesson_plans`, which takes that row's write lock by itself. The
   * test was measuring Postgres, not the code, so the redundant lock was removed rather than shipped
   * behind a green test that could never fail. `hooks/lessonPlan.ts` carries the reasoning at the
   * point someone would otherwise re-add it.
   */
})
