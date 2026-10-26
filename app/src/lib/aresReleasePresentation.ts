import type { LessonBundleVersion, LessonPlan } from '../payload-types'
import { newestAncestor } from './combine/ancestry'
import { formatCalendarDay } from './formatDate'
import { relId } from './relId'
import { compareSemver } from './semver'

type Release = Partial<Pick<LessonBundleVersion, 'releaseFingerprint' | 'aresReleaseDate'>>
type LabelledVersion = Release & { id: number; semver?: string | null }
type ListedVersion = Pick<LessonBundleVersion, 'id' | 'semver' | 'createdAt'> & Release

/** "ARES release 14 Nov 2026" for a version created from an ARES upload; null for a teacher's save. */
export function aresReleaseLabel(version: Release): string | null {
  if (!version.releaseFingerprint) return null
  const date = formatCalendarDay(version.aresReleaseDate)
  return date ? `ARES release ${date}` : 'ARES release: not stated'
}

export function releaseVersionLabel(version: LabelledVersion): string {
  return [version.semver ?? `v${version.id}`, aresReleaseLabel(version)].filter(Boolean).join(' · ')
}

/**
 * The parts of "Official updated to the ARES release of … on …". The audit record alone supplies
 * when, from which Official and who made the change; the date is rendered in the reader's own zone.
 */
export function officialUpdateNotice(
  plan: Pick<LessonPlan, 'officialChangedAt' | 'officialChangedFrom' | 'officialChangedBy'>,
  official: ListedVersion | undefined,
  versions: readonly ListedVersion[],
): { release: string | null; changedAt: string; previousSemver: string | null } | null {
  if (!plan.officialChangedAt || plan.officialChangedBy != null || !official?.releaseFingerprint)
    return null
  if (!Number.isFinite(Date.parse(plan.officialChangedAt))) return null
  return {
    release: formatCalendarDay(official.aresReleaseDate),
    changedAt: plan.officialChangedAt,
    previousSemver: versions.find((v) => v.id === relId(plan.officialChangedFrom))?.semver ?? null,
  }
}

/**
 * A suggestion only: the caller's latest save, when the newest ARES release in its readable ancestry
 * is older than the current Official release. Returns what the prompt needs, or null.
 */
export function newerReleaseSuggestion(
  versions: readonly (ListedVersion & Pick<LessonBundleVersion, 'author' | 'lineage'>)[],
  official: ListedVersion | undefined,
  userId: number,
): { ownId: number; ownSemver: string; officialId: number } | null {
  if (!official?.releaseFingerprint) return null
  const own = newestAncestor(
    versions.filter((v) => relId(v.author) === userId && !v.releaseFingerprint),
  )
  if (!own) return null
  const base = newestAncestor(
    versions.filter((v) => v.releaseFingerprint && own.lineage?.includes(v.id)),
  )
  return base && compareSemver(official.semver, base.semver) > 0
    ? { ownId: own.id, ownSemver: own.semver, officialId: official.id }
    : null
}
