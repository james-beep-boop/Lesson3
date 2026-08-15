/**
 * The Official-pointer serialisation lock.
 *
 * THE RACE THIS EXISTS TO CLOSE. Two authorized admins, no attacker, no operator error:
 *
 *   1. A deletes version V. `enforceOfficialNotDeletable` reads the plan's `officialVersion`,
 *      sees W, and allows the delete because V ≠ W.
 *   2. B promotes V. `makeOfficialEndpoint` moves the pointer to V and commits.
 *   3. A's delete commits. The FK is `ON DELETE SET NULL`, so the plan's pointer is nulled.
 *
 * The plan now has NO Official version: it vanishes from the library (which lists plans via their
 * Official version) and the approved snapshot B just promoted is gone. Both halves are a
 * read-then-write over the same row, in separate transactions, with nothing serialising them —
 * the exact shape `lockSubjectGrades` (`ingest/index.ts`) and `grantSiteAdminToFirstUser`
 * (`hooks/userRoles.ts`) already close elsewhere in this codebase.
 *
 * THE FIX is that both paths take a row lock on the PLAN before the read that decides. The plan row
 * is the thing being contended — not the version — because the pointer lives on it, and because a
 * lock on the version would leave two different versions of the same plan racing each other.
 *
 * ⚑ **This lock is useless outside a transaction, which is why it REFUSES to run there.**
 * `SELECT … FOR UPDATE` holds only until the enclosing transaction ends; issued on a pooled
 * connection with no transaction open, Postgres releases it at once and the statement becomes an
 * expensive no-op that reads exactly like protection. `lockSubjectGrades` tolerates that case and
 * documents it as "a harmless no-op" — true for ingest, where the caller is always transactional and
 * the lock is defence in depth. It is NOT true here: the window this closes is a handful of
 * milliseconds between a read and a write, so a lock that silently fails to hold restores the
 * original bug while looking fixed. Hence `requireTransaction: true`.
 *
 * DEADLOCK. Both call sites lock the same single object, so there is no lock-ordering hazard to
 * manage. Re-entrance is safe: `make-official?deletePrevious=true` runs the version delete inside
 * its own transaction, so `enforceOfficialNotDeletable` re-locks a row this transaction already
 * holds — which Postgres treats as a no-op, not a self-deadlock.
 */
import type { PayloadRequest } from 'payload'

import { lockRows } from './txDb'

/**
 * Take the plan's row lock inside the caller's transaction, blocking any concurrent holder until
 * that transaction commits or rolls back.
 *
 * A named wrapper over `lockRows` rather than a call site of it, because the RACE is the thing worth
 * finding — a reader who follows `lockRows` from `enforceOfficialNotDeletable` should land on the
 * module header above, not on a generic row-lock helper shared with ingest and role changes.
 * `lockRows` fails closed and orders its locks; this adds only the domain meaning.
 */
export async function lockLessonPlan(req: PayloadRequest, planId: number): Promise<void> {
  await lockRows(req, 'lesson_plans', [planId])
}
