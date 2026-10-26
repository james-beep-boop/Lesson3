import { canonicalJson } from '../lib/canonicalJson'
import { compareSemver } from '../lib/semver'
import { sha256, type AresRelease } from './lessonManifest'

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
    if (newestDated && release.date < newestDated.aresReleaseDate!)
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
  plan: number
  title: string
  currentOfficial: number | null
  incomingSemver: string
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
/** Canonical ordering makes file picker, archive and object-key order irrelevant; content is bound too. */
export function previewToken(preview: OfficialPreview[]): string {
  return sha256(
    canonicalJson([...preview].sort((a, b) => a.file.localeCompare(b.file) || a.plan - b.plan)),
  )
}

/**
 * The one gate on moving Official, used by pre-flight and again under the write locks: a move needs
 * the token of exactly these decisions, and a supplied token must still match even if nothing moves.
 */
export const confirmationRequired = (preview: OfficialPreview[], confirmOfficial?: string) =>
  confirmOfficial !== previewToken(preview) &&
  (confirmOfficial !== undefined || preview.some((p) => p.willMove))
