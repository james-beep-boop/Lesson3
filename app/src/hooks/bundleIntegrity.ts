import type { CollectionBeforeChangeHook } from 'payload'

import { bumpSemver } from '../lib/semver'
import { applyEditorFieldSplit } from './fieldSplit'

/**
 * Structural + field-level integrity for LessonBundles (SPEC §5, §6, §13).
 *
 * Runs for ALL users on every save:
 *   1. Re-derives system-only lesson numbers from array order.
 *   2. Versioning — initialises semver/lockVersion on create; bumps them on update.
 * Then delegates the Editor/Admin field-split (the prose whitelist + cardinality guard) to the
 * shared `applyEditorFieldSplit` (also used by `lesson-bundle-versions`). The ONLY bundle-specific
 * part is which top-level keys an Editor may influence: the content containers plus the bundle's own
 * version fields (`semver`/`bumpType`/`lockVersion`) and `_status` (preserved — publishing is Subject
 * Admin only).
 */
const BUNDLE_EDITOR_KEYS = new Set([
  'lessons',
  'finalExplanation',
  'summaryTable',
  'semver',
  'bumpType',
  'lockVersion',
  'updatedAt',
])

export const enforceBundleStructure: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  // 1. System-only numbering, derived from order.
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

  // 2. Versioning (SPEC §6) — runs for all users on every save.
  if (operation === 'create') {
    data.semver = '1.0.0'
    data.lockVersion = 0
    data.bumpType = 'patch'
  } else if (operation === 'update' && originalDoc) {
    data.semver = bumpSemver(originalDoc.semver ?? '1.0.0', data.bumpType ?? 'patch')
    data.bumpType = 'patch' // reset after consuming
    data.lockVersion = (originalDoc.lockVersion ?? 0) + 1
  }

  // 3. Editor/Admin field-split (shared with lesson-bundle-versions).
  return applyEditorFieldSplit({ data, originalDoc, operation, req, editorTopLevelKeys: BUNDLE_EDITOR_KEYS })
}
