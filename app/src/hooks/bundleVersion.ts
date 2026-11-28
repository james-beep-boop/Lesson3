import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'

import { applyEditorFieldSplit } from './fieldSplit'
import { generatableFieldErrors } from '../ingest/validateGeneratable'
import { planSeries } from '../lib/versionSeries'
import { guardOfficialDeletion, guardVersionSubjectGrade } from './versionSeries'

export const enforceOfficialNotDeletable = guardOfficialDeletion(planSeries)
export const enforceVersionPlanConsistency = guardVersionSubjectGrade(planSeries)

// Top-level keys a teacher with editing access may influence on a version: the content containers only. Identity/version
// metadata (title, subjectGrade, lessonPlan, sourceVersion, semver, meta, unit) is preserved. Unlike
// a bundle, a version has no `semver` bump on edit, no `bumpType`/`lockVersion`, and no `_status`.
export const VERSION_EDITOR_KEYS = new Set([
  'lessons',
  'finalExplanation',
  'summaryTable',
  'updatedAt',
])

/**
 * Editor/Admin field-split for versions (SPEC §5) — shared whitelist via `applyEditorFieldSplit`.
 * A teacher with editing access editing a (Not-Official) working version may change prose only; structure, META, answer
 * keys, and identity/version metadata are preserved from the original. Admins are unrestricted.
 */
export const enforceVersionFieldSplit: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) =>
  applyEditorFieldSplit({
    data,
    originalDoc,
    operation,
    req,
    editorTopLevelKeys: VERSION_EDITOR_KEYS,
  })

// The immutability guarantee (`enforceVersionImmutable`) moved to `access/versionImmutability.ts`,
// deliberately colocated with its paired form-render-only update grant — read that module's header
// before touching anything about version updates.

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

export const enforceBundleVersionGeneratable: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const merged = { ...originalDoc, ...data }
  const problems = generatableFieldErrors(merged)
  if (problems.length > 0) {
    throw new ValidationError(
      {
        collection: 'lesson-bundle-versions',
        errors: problems,
      },
      req.t,
    )
  }

  return data
}
