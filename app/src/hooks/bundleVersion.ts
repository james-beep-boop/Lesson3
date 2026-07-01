import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionSlug,
} from 'payload'
import { APIError, ValidationError } from 'payload'

import { toId } from '../access'
import { applyEditorFieldSplit } from './fieldSplit'
import { DELETING_LESSON_PLAN_IDS } from './lessonPlan'
import { validateGeneratable } from '../ingest/validateGeneratable'

const LESSON_PLANS = 'lesson-plans' as CollectionSlug

// Top-level keys an Editor may influence on a version: the content containers only. Identity/version
// metadata (title, subjectGrade, lessonPlan, sourceVersion, semver, meta, unit) is preserved. Unlike
// a bundle, a version has no `semver` bump on edit, no `bumpType`/`lockVersion`, and no `_status`.
export const VERSION_EDITOR_KEYS = new Set(['lessons', 'finalExplanation', 'summaryTable', 'updatedAt'])

/**
 * Editor/Admin field-split for versions (SPEC §5) — shared whitelist via `applyEditorFieldSplit`.
 * An Editor editing a (Not-Official) working version may change prose only; structure, META, answer
 * keys, and identity/version metadata are preserved from the original. Admins are unrestricted.
 */
export const enforceVersionFieldSplit: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) =>
  applyEditorFieldSplit({ data, originalDoc, operation, req, editorTopLevelKeys: VERSION_EDITOR_KEYS })

/**
 * Immutability guarantee for saved versions. The collection's `update` ACCESS is deliberately
 * permissive (Editors/Admins in their subject-grades — see `lessonBundleVersionUpdate`) ONLY so
 * Payload's admin renders the edit form as editable (Payload forces the whole form read-only when the
 * user lacks `update` permission). A saved version must never be written back to, so the hard
 * guarantee lives here: reject every AUTHENTICATED in-place `update`. This exactly preserves the old
 * `update: () => false` semantics — a stray/direct API PATCH by any role fails — while letting the
 * form render editable. Trusted system paths (no `req.user`: migrations, data fixes; the same
 * carve-out as the field-split, `fieldSplit.ts`) may still update via overrideAccess. Authoring a
 * change is a CREATE (save-as-new), so `create` is untouched.
 */
export const enforceVersionImmutable: CollectionBeforeChangeHook = ({ operation, req }) => {
  if (operation === 'update' && req.user) {
    throw new APIError('Versions are immutable — save your changes as a new version instead.', 403)
  }
}

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
