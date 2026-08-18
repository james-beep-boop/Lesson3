import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionSlug,
} from 'payload'
import { APIError, ValidationError } from 'payload'

import { toId } from '../access'
import { applyEditorFieldSplit } from './fieldSplit'
import { lockRows } from '../lib/txDb'
import { DELETING_LESSON_PLAN_IDS } from './lessonPlan'
import { validateGeneratable } from '../ingest/validateGeneratable'

const LESSON_PLANS = 'lesson-plans' as CollectionSlug

// Top-level keys a teacher with editing access may influence on a version: the content containers only. Identity/version
// metadata (title, subjectGrade, lessonPlan, sourceVersion, semver, meta, unit) is preserved. Unlike
// a bundle, a version has no `semver` bump on edit, no `bumpType`/`lockVersion`, and no `_status`.
export const VERSION_EDITOR_KEYS = new Set(['lessons', 'finalExplanation', 'summaryTable', 'updatedAt'])

/**
 * Editor/Admin field-split for versions (SPEC §5) — shared whitelist via `applyEditorFieldSplit`.
 * A teacher with editing access editing a (Not-Official) working version may change prose only; structure, META, answer
 * keys, and identity/version metadata are preserved from the original. Admins are unrestricted.
 */
export const enforceVersionFieldSplit: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) =>
  applyEditorFieldSplit({ data, originalDoc, operation, req, editorTopLevelKeys: VERSION_EDITOR_KEYS })

// The immutability guarantee (`enforceVersionImmutable`) moved to `access/versionImmutability.ts`,
// deliberately colocated with its paired form-render-only update grant — read that module's header
// before touching anything about version updates.

/** Is `versionId` the Official version of plan `planId`? Fetches just the plan. */
export async function isOfficialVersion(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  planId: number,
  versionId: number | string,
): Promise<boolean> {
  const plan = (await req.payload.findByID({
    collection: LESSON_PLANS,
    id: planId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { officialVersion?: unknown }
  return String(toId(plan.officialVersion as never)) === String(versionId)
}

export const numberBundleVersionRows: CollectionBeforeValidateHook = ({ data }) => {
  if (Array.isArray(data?.lessons)) {
    data.lessons.forEach((lesson: { number?: number }, i: number) => {
      lesson.number = i + 1
    })
  }
  if (Array.isArray(data?.summaryTable?.lessons)) {
    data.summaryTable.lessons.forEach((lesson: { number?: number }, i: number) => {
      lesson.number = i + 1
    })
  }
  return data
}

/**
 * Retention guard: the Official version cannot be DELETED (it would orphan the plan's pointer and
 * lose the canonical snapshot). Not-Official working versions remain deletable, so a Site Admin can
 * still prune abandoned working copies. To delete the Official version, first move the pointer to
 * another version (Make Official) — then this version is no longer Official and may be deleted.
 * Runs on every path (incl. system/overrideAccess), since orphaning the pointer is never desirable;
 * callers that legitimately need to remove it null/move the pointer first (e.g. roundtrip cleanup).
 */
export const enforceOfficialNotDeletable: CollectionBeforeDeleteHook = async ({ id, req }) => {
  // No `originalDoc` on delete — fetch the version for its plan id, then check the plan's pointer.
  const version = (await req.payload.findByID({
    collection: 'lesson-bundle-versions',
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { lessonPlan?: unknown }
  const planId = toId(version.lessonPlan as never)
  if (planId == null) return
  // The parent plan is being deleted in this same request (cascadeDeleteLessonPlanVersions): its
  // Official pointer is moot, so the cascade may legitimately remove this version. Stand down.
  const deletingPlans = req.context[DELETING_LESSON_PLAN_IDS] as Set<string> | undefined
  if (deletingPlans?.has(String(planId))) return
  // ⚑ SERIALISE against a concurrent promotion BEFORE the read that decides. Do not remove this
  // without reading the whole comment — two of the three locks originally written for this race WERE
  // removed as unprovable (DECISIONS 2026-08-14), and this is the one that is load-bearing.
  //
  // THE RACE. Two authorized admins, no attacker, no operator error:
  //
  //   1. A deletes version V. This guard reads the plan's `officialVersion`, sees W, and allows the
  //      delete because V ≠ W.
  //   2. B promotes V. `makeOfficialEndpoint` moves the pointer to V and commits.
  //   3. A's delete commits. The FK is `ON DELETE SET NULL`, so the pointer B just set is nulled.
  //
  // The plan then has NO Official version: it vanishes from the library (which lists plans via their
  // Official version) and the snapshot B approved is gone.
  //
  // Step 1's READ is the vulnerable half, and the database does not protect it: a plain `SELECT`
  // under READ COMMITTED does not block on another transaction's uncommitted `UPDATE` — it returns
  // the OLD value. Locking first makes this guard wait for an in-flight promotion and then read what
  // was actually committed.
  //
  // The PLAN row is what gets locked, not the version, because the pointer lives on the plan — and a
  // lock on the version would leave two versions of the same plan racing each other.
  //
  // Deliberately AFTER the cascade stand-down above: a plan being deleted in this same request has
  // no pointer left to protect, and locking it there would be pure contention.
  //
  // Re-entrance is safe: `make-official?deletePrevious=true` runs its version delete inside its own
  // transaction, so this re-locks a row that transaction already holds — a no-op to Postgres, not a
  // self-deadlock. And `lockRows` REFUSES to run outside a transaction rather than falling back to
  // the pool, where `FOR UPDATE` is released immediately and would hold nothing while looking exactly
  // like protection. `tests/int/officialPointerLock.int.spec.ts` is the guard, watched going red
  // against a reverted lock.
  await lockRows(req, 'lesson_plans', [planId])
  if (await isOfficialVersion(req, planId, id)) {
    throw new APIError(
      'This version is Official and cannot be deleted. Make another version Official first.',
      409,
    )
  }
}

/**
 * Integrity: a version's `subjectGrade` MUST equal its parent plan's `subjectGrade`. Read-scoping and
 * authorization key off the version's own `subjectGrade` (`lessonBundleVersionRead/Update`), so a row
 * whose grade disagrees with its plan would authorize/render under the wrong grade. The workflow paths
 * keep them aligned (ingest creates the plan then the version with the same grade; fork copies the
 * source's grade) — this guard closes the direct-API hole where a privileged caller sets a mismatched
 * grade. Runs on create AND update; the plan lookup uses overrideAccess (integrity, not authz).
 */
export const enforceVersionPlanConsistency: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data
  const planId = toId((data.lessonPlan ?? originalDoc?.lessonPlan) as never)
  const sgId = toId((data.subjectGrade ?? originalDoc?.subjectGrade) as never)
  // `lessonPlan`/`subjectGrade` are both required — let the required-field validation report absence.
  if (planId == null || sgId == null) return data

  const plan = (await req.payload.findByID({
    collection: LESSON_PLANS,
    id: planId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { subjectGrade?: unknown }
  const planSgId = toId(plan.subjectGrade as never)
  if (planSgId != null && planSgId !== sgId) {
    throw new ValidationError(
      {
        collection: 'lesson-bundle-versions',
        errors: [{ message: 'Version subject-grade must match its lesson plan.', path: 'subjectGrade' }],
      },
      req.t,
    )
  }
  return data
}

export const enforceBundleVersionGeneratable: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const merged = { ...originalDoc, ...data }
  const problems = validateGeneratable(merged)
  if (problems.length > 0) {
    throw new ValidationError(
      {
        collection: 'lesson-bundle-versions',
        errors: problems.map((message) => ({ message, path: '' })),
      },
      req.t,
    )
  }

  return data
}
