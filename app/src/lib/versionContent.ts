/**
 * What on a lesson-bundle version is CONTENT and what is identity — one definition for every
 * comparison and copy of version content.
 *
 * Moved here from `endpoints/versionEdit.ts` (2026-10-17) when Combine versions needed the same
 * answer: two copies of "which keys are metadata" would let save-as-new's no-op guard and the
 * combine engine disagree about whether two versions differ.
 */
import { canonicalJson } from './canonicalJson'
import { stripIds } from './stripIds'

/** Content keys NOT carried into a forked copy (identity/version metadata + Payload internals).
 *  `author` is stamped server-side from the authenticated caller — a submitted value is never trusted. */
export const DROP_KEYS = new Set([
  'id',
  // Worldwide identity (2026-10-19, `fields/identity.ts`): never content, never copied — a new
  // version gets its own uid, and only ingest gives one a release fingerprint.
  'uid',
  'releaseFingerprint',
  // Worldwide ancestry and origin (2026-10-29): stamped on every create, never inherited.
  'originInstallation',
  'sourceVersionKey',
  'mergedFromKey',
  'lineageKeys',
  'aresReleaseId',
  'aresReleaseDate',
  'semver',
  'sourceVersion',
  'mergedFrom',
  'lineage',
  'mergeParent',
  'author',
  'createdAt',
  'updatedAt',
])

/** Relationship keys the server sets from the SOURCE on create (never from the submission). They
 *  carry no edit signal, and their representation varies with fetch depth (id vs populated doc), so
 *  content comparisons exclude them on both sides. */
const SERVER_REL_KEYS = new Set(['lessonPlan', 'subjectGrade'])

/** The version's content keys only: everything that is neither identity metadata nor a server rel. */
export const contentOf = (doc: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(doc).filter(([k]) => !DROP_KEYS.has(k) && !SERVER_REL_KEYS.has(k)),
  )

/** The canonical form "same content" is decided on: content keys only, row ids stripped, keys sorted. */
export const comparableContent = (doc: Record<string, unknown>): string =>
  canonicalJson(stripIds(contentOf(doc)))
