import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionSlug,
} from 'payload'
import { APIError, ValidationError } from 'payload'

import { toId } from '../access'
import { applyEditorFieldSplit } from './fieldSplit'
import { validateGeneratable } from '../ingest/validateGeneratable'

const LESSON_PLANS = 'lesson-plans' as CollectionSlug

// Top-level keys an Editor may influence on a version: the content containers only. Identity/version
// metadata (title, subjectGrade, lessonPlan, sourceVersion, semver, meta, unit) is preserved. Unlike
// a bundle, a version has no `semver` bump on edit, no `bumpType`/`lockVersion`, and no `_status`.
const VERSION_EDITOR_KEYS = new Set(['lessons', 'finalExplanation', 'summaryTable', 'updatedAt'])

/**
 * Editor/Admin field-split for versions (SPEC §5) — shared whitelist via `applyEditorFieldSplit`.
 * An Editor editing a (Not-Official) working version may change prose only; structure, META, answer
 * keys, and identity/version metadata are preserved from the original. Admins are unrestricted.
 */
export const enforceVersionFieldSplit: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) =>
  applyEditorFieldSplit({ data, originalDoc, operation, req, editorTopLevelKeys: VERSION_EDITOR_KEYS })

/** The plan id a version belongs to, and whether the version is that plan's Official one. */
async function officialStatus(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  versionId: number | string,
): Promise<{ planId: number | null; isOfficial: boolean }> {
  const version = (await req.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: versionId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { lessonPlan?: unknown }
  const planId = toId(version.lessonPlan as never) ?? null
  if (planId == null) return { planId, isOfficial: false }
  const plan = (await req.payload.findByID({
    collection: LESSON_PLANS,
    id: planId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { officialVersion?: unknown }
  return { planId, isOfficial: String(toId(plan.officialVersion as never)) === String(versionId) }
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
 * Working-copy model (Stage 2b): the Official version is IMMUTABLE. Reject any update to a version
 * that is currently its plan's `officialVersion`. To change an Official version you fork a new
 * Not-Official working copy (the fork endpoint) and edit that; marking it Official then freezes it.
 *
 * Why a hook (not access): "is this version the one my plan points to as Official?" can't be
 * expressed as a collection-wide access `Where` (the official id differs per plan). The plan lookup
 * uses overrideAccess — this is an integrity guard, not an authorization boundary (update access
 * already gated the caller). System paths (no `req.user`: migrations/ingest) are exempt.
 */
export const enforceVersionImmutable: CollectionBeforeChangeHook = async ({
  operation,
  originalDoc,
  data,
  req,
}) => {
  if (operation !== 'update' || !originalDoc || !req.user) return data
  const { isOfficial } = await officialStatus(req, originalDoc.id)
  if (isOfficial) {
    throw new ValidationError(
      {
        collection: 'lesson-bundle-versions',
        errors: [
          {
            message:
              'This version is Official and cannot be edited. Use “Edit” to create a new working version from it.',
            path: '',
          },
        ],
      },
      req.t,
    )
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
  const { isOfficial } = await officialStatus(req, id)
  if (isOfficial) {
    throw new APIError(
      'This version is Official and cannot be deleted. Make another version Official first.',
      409,
    )
  }
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
