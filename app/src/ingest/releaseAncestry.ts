import { backfillLineages, type LineageRow } from '../lib/combine/backfill'

export interface ReleaseRow extends LineageRow {
  semver: string
  author: number | null
  substrandId: string | null
}

/** Only ingest creates whole-major versions; author alone is insufficient (deleted users become null). */
export function releaseMajor(row: ReleaseRow): number | null {
  if (row.author != null || row.second != null || !/^[1-9]\d*\.0\.0$/.test(row.semver)) return null
  const major = Number(row.semver.split('.')[0])
  return Number.isSafeInteger(major) ? major : null
}

/** Same-plan rows only, read under the ingest lock. Never use Official or the latest teacher patch. */
export function latestRelease(rows: ReleaseRow[], substrandId: string): ReleaseRow | null {
  return rows.reduce<ReleaseRow | null>((latest, row) => {
    const major = releaseMajor(row)
    return major != null &&
      row.substrandId?.trim() === substrandId &&
      (!latest || major > releaseMajor(latest)!)
      ? row
      : latest
  }, null)
}

/** Audit before writing. Existing relationships are immutable; gaps/ambiguous identities are reported. */
export function auditReleaseAncestry(rows: ReleaseRow[]) {
  const parents = new Map<number, number>()
  const skipped: { id: number; reason: string }[] = []
  const majors = new Map<number, ReleaseRow[]>()
  for (const row of rows) {
    const match = /^([1-9]\d*)\.0\.0$/.exec(row.semver)
    if (!match) continue
    const major = Number(match[1])
    majors.set(major, [...(majors.get(major) ?? []), row])
  }
  for (const row of rows) {
    const major = releaseMajor(row)
    if (major === 1 || row.source != null || !/^([1-9]\d*)\.0\.0$/.test(row.semver)) continue
    const previous = major != null ? majors.get(major - 1) : undefined
    const parent = previous?.length === 1 ? previous[0] : undefined
    if (
      major == null ||
      !parent ||
      releaseMajor(parent) == null ||
      !row.substrandId?.trim() ||
      row.substrandId.trim() !== parent.substrandId?.trim() ||
      majors.get(major)?.length !== 1
    ) {
      skipped.push({ id: row.id, reason: 'Missing or ambiguous consecutive ingested releases' })
      continue
    }
    // A surviving closure proves this is a deleted relationship, not a legacy unlinked release.
    // Do not replace that provenance with a guessed predecessor.
    if (row.lineage?.length) {
      skipped.push({ id: row.id, reason: 'Existing ancestry without a surviving source' })
      continue
    }
    parents.set(row.id, parent.id)
  }
  let lineage = new Map<number, number[]>()
  if (parents.size) {
    try {
      lineage = backfillLineages(rows.map((r) => ({ ...r, source: parents.get(r.id) ?? r.source })))
    } catch {
      skipped.push({ id: rows[0].id, reason: 'Cyclic ancestry; entire plan left unchanged' })
      parents.clear()
    }
  }
  return { parents, lineage, skipped }
}
