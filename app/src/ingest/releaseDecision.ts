import { createHash } from 'node:crypto'
import { compareSemver } from '../lib/semver'
import type { AresRelease } from './lessonManifest'

export type ReleaseVersion = {
  id: number
  semver: string
  releaseFingerprint?: string | null
  aresReleaseId?: string | null
  aresReleaseDate?: string | null
}
export type ReleaseDecision = {
  action: 'new' | 'alreadyHere' | 'olderNotImported' | 'conflict'
  version?: ReleaseVersion
  olderContent?: ReleaseVersion
}
/** Identity before age: a reused id can never be disguised as an older release. */
export function decideRelease(
  history: ReleaseVersion[],
  fingerprint: string,
  release?: AresRelease,
): ReleaseDecision {
  const releases = history
    .filter((v) => v.releaseFingerprint)
    .sort((a, b) => compareSemver(b.semver, a.semver))
  if (release) {
    const sameId = releases.filter((v) => v.aresReleaseId === release.id)
    const conflict = sameId.find((v) => v.releaseFingerprint !== fingerprint)
    if (conflict) return { action: 'conflict', version: conflict }
    if (sameId[0]) return { action: 'alreadyHere', version: sameId[0] }
    const newestDated = releases
      .filter((v) => v.aresReleaseDate)
      .sort((a, b) => b.aresReleaseDate!.localeCompare(a.aresReleaseDate!))[0]
    if (newestDated?.aresReleaseDate && release.date < newestDated.aresReleaseDate)
      return { action: 'olderNotImported', version: newestDated }
  } else {
    if (releases[0]?.releaseFingerprint === fingerprint)
      return { action: 'alreadyHere', version: releases[0] }
    const olderContent = releases.slice(1).find((v) => v.releaseFingerprint === fingerprint)
    if (olderContent) return { action: 'new', olderContent }
  }
  return { action: 'new' }
}
export type OfficialPreview = {
  file: string
  plan: number | null
  title: string
  currentOfficial: number | null
  incomingSemver?: string
  previousSemver: string | null
  release: AresRelease | null
  fingerprint: string
  decision: ReleaseDecision['action']
  willMove: boolean
  reason: string
  olderContent: string | null
}
export const officialDecision = (
  official: ReleaseVersion | undefined,
): { willMove: boolean; reason: string } =>
  official?.releaseFingerprint
    ? { willMove: true, reason: 'The current Official is an ARES release.' }
    : {
        willMove: false,
        reason: official
          ? 'A teacher’s version is Official; waiting for the subject-grade administrator.'
          : 'No Official version; waiting for the subject-grade administrator.',
      }
/** Canonical ordering makes file picker and archive order irrelevant; content is bound too. */
export function previewToken(preview: OfficialPreview[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        [...preview].sort((a, b) => a.file.localeCompare(b.file) || (a.plan ?? 0) - (b.plan ?? 0)),
      ),
    )
    .digest('hex')
}
