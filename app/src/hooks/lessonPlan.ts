import type { CollectionBeforeValidateHook, CollectionSlug } from 'payload'
import { ValidationError } from 'payload'

import { toId } from '../access'

const LESSON_BUNDLE_VERSIONS = 'lesson-bundle-versions' as CollectionSlug

const idFrom = (value: unknown): number | undefined => {
  const id = toId(value as never)
  return typeof id === 'number' ? id : undefined
}

const validationError = (message: string, req: Parameters<CollectionBeforeValidateHook>[0]['req']) =>
  new ValidationError(
    {
      collection: 'lesson-plans',
      errors: [{ message, path: 'officialVersion' }],
    },
    req.t,
  )

export const validateOfficialVersionPointer: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  // Invariant: a lesson plan keeps exactly one Official version. Reject an AUTHENTICATED update that
  // clears the pointer to null — browse skips a plan with no Official, its detail can 404, and the
  // "one Official" product rule breaks. System paths (no `req.user`: migrations, roundtrip cleanup,
  // the int-fixture teardown that nulls the pointer before deleting versions) legitimately clear it
  // via overrideAccess and are exempt — same trusted-system carve-out as the field-split/immutability
  // hooks. (Create with no pointer yet is fine: ingest sets it in a follow-up update.)
  if (operation === 'update' && req.user && data && 'officialVersion' in data && !idFrom(data.officialVersion)) {
    throw validationError('A lesson plan must keep one Official version; the pointer cannot be cleared.', req)
  }

  if (!data?.officialVersion) return data

  const officialVersionId = idFrom(data.officialVersion)
  if (!officialVersionId) {
    throw validationError('Official version must reference a saved lesson-plan version.', req)
  }

  const version = (await req.payload.findByID({
    collection: LESSON_BUNDLE_VERSIONS,
    id: officialVersionId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { lessonPlan?: unknown; subjectGrade?: unknown }

  const planId = idFrom(originalDoc?.id)
  const versionPlanId = idFrom(version.lessonPlan)
  if (planId && versionPlanId !== planId) {
    throw validationError('Official version must belong to this lesson plan.', req)
  }

  const planSubjectGradeId = idFrom(data.subjectGrade ?? originalDoc?.subjectGrade)
  const versionSubjectGradeId = idFrom(version.subjectGrade)
  if (planSubjectGradeId && versionSubjectGradeId !== planSubjectGradeId) {
    throw validationError('Official version must match this lesson plan subject-grade.', req)
  }

  return data
}
