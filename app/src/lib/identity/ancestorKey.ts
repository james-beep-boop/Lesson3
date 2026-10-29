/**
 * Worldwide ancestry keys (2026-10-29; `docs/PLAN-worldwide-ids-part2-2026-10-29.md` §B).
 *
 * A version is named in its descendants' ancestry by:
 *   - its ARES release fingerprint, when it has one — two schools importing the same release get
 *     different uids but the same fingerprint, so their descendants name the SAME ancestor, and keep
 *     doing so after either school deletes its row;
 *   - otherwise its `uid`.
 *
 * `local:<installationId>:<serial>` names an ancestor whose worldwide identity was already lost (its
 * row was deleted before keys were recorded). Stable within this installation, so a merge base here
 * still works; it claims nothing anywhere else.
 *
 * The formats cannot be confused: `ares-content-v1:sha256:…`, a UUID, or `local:…`.
 */
const LOCAL_KEY_PREFIX = 'local:'

export function ancestorKey(version: {
  uid?: string | null
  releaseFingerprint?: string | null
}): string {
  if (version.releaseFingerprint) return version.releaseFingerprint
  if (version.uid) return version.uid
  throw new Error('A version without a uid cannot be named as an ancestor.')
}

export const localAncestorKey = (installationId: string, serial: number): string =>
  `${LOCAL_KEY_PREFIX}${installationId}:${serial}`
