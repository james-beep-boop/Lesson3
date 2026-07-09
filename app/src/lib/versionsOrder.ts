/**
 * The app-wide version-list order (DECISIONS 2026-07-06, version browser design): the Official
 * pinned first, then most-recent → oldest. Pure — shared by the VersionsPanel (client) and any
 * server list that shows versions to people. (`findReadableVersions` itself stays ascending: its
 * callers historically rely on oldest-first for pills/compare pickers; presentation lists apply
 * THIS order at the edge.)
 */
export function sortVersionsOfficialFirst<
  T extends { id: number | string; createdAt?: string | null },
>(versions: readonly T[], officialVersionId: number | string | null | undefined): T[] {
  const isOfficial = (v: T): boolean =>
    officialVersionId != null && String(v.id) === String(officialVersionId)
  return [...versions].sort((a, b) => {
    if (isOfficial(a) !== isOfficial(b)) return isOfficial(a) ? -1 : 1
    return (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0)
  })
}
