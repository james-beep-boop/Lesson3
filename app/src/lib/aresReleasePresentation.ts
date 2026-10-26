import type { LessonBundleVersion, LessonPlan } from '../payload-types'
import { relId } from './relId'
import { compareSemver } from './semver'

type Release = Pick<LessonBundleVersion, 'releaseFingerprint' | 'aresReleaseDate'>
type Version = Release & { id: number; semver?: string | null }

/** ARES dates are calendar dates, never the reader's local midnight or the import time. */
export function releaseDateLabel(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function aresReleaseLabel(version: Release): string | null {
  if (!version.releaseFingerprint) return null
  const date = releaseDateLabel(version.aresReleaseDate)
  return date ? `ARES release ${date}` : 'ARES release: not stated'
}

export function releaseVersionLabel(version: Version): string {
  return [version.semver ?? `v${version.id}`, aresReleaseLabel(version)].filter(Boolean).join(' · ')
}

/** The audit record alone supplies when, from which Official and who made the change. */
export function officialUpdateNotice(
  plan: Pick<LessonPlan, 'officialChangedAt' | 'officialChangedFrom' | 'officialChangedBy'>,
  official: Version | undefined,
  versions: readonly Version[],
): string | null {
  if (!plan.officialChangedAt || plan.officialChangedBy != null || !official?.releaseFingerprint)
    return null
  const at = new Date(plan.officialChangedAt)
  if (!Number.isFinite(at.getTime())) return null
  const changed = releaseDateLabel(at.toISOString().slice(0, 10))!
  const release = releaseDateLabel(official.aresReleaseDate)
  const previous = versions.find((v) => v.id === relId(plan.officialChangedFrom))
  return (
    `Official updated to ${release ? `the ARES release of ${release}` : 'an ARES release (date not stated)'} on ${changed}.` +
    (previous?.semver
      ? ` The previous Official (${previous.semver}) is still in the version history.`
      : '')
  )
}

type AncestryVersion = Version & Pick<LessonBundleVersion, 'author' | 'lineage'>

/** A suggestion only: use readable ancestry to prove the caller's latest save has an older base. */
export function newerOfficialForTeacher(
  versions: readonly AncestryVersion[],
  official: AncestryVersion | undefined,
  userId: number,
): AncestryVersion | null {
  if (!official?.releaseFingerprint || !official.semver) return null
  const own = versions
    .filter((v) => relId(v.author) === userId && !v.releaseFingerprint)
    .sort((a, b) => compareSemver(b.semver ?? '', a.semver ?? ''))[0]
  if (!own || own.id === official.id || own.lineage?.includes(official.id)) return null
  const base = versions
    .filter((v) => v.releaseFingerprint && own.lineage?.includes(v.id))
    .sort((a, b) => compareSemver(b.semver ?? '', a.semver ?? ''))[0]
  return base?.semver && compareSemver(official.semver, base.semver) > 0 ? own : null
}
