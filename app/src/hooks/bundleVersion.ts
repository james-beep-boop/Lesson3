import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionSlug } from 'payload'
import { ValidationError } from 'payload'

import { toId } from '../access'
import { validateGeneratable } from '../ingest/validateGeneratable'

const LESSON_PLANS = 'lesson-plans' as CollectionSlug

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
  const planId = toId(originalDoc.lessonPlan as never)
  if (planId == null) return data

  const plan = (await req.payload.findByID({
    collection: LESSON_PLANS,
    id: planId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { officialVersion?: unknown }

  if (toId(plan.officialVersion as never) === originalDoc.id) {
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
