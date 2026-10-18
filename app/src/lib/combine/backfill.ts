import { MAX_LINEAGE, unionLineage } from './lineage'

export interface LineageRow {
  id: number
  source: number | null
  second?: number | null
  lineage?: number[] | null
}

/** Bounded iterative traversal, including existing closures so reruns preserve deleted ancestors. */
export function backfillLineages(rows: LineageRow[]): Map<number, number[]> {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const result = new Map<number, number[]>()
  for (const row of rows) {
    const seen = new Set<number>()
    const pending = [row.source, row.second].filter((id): id is number => id != null)
    const ancestors = new Set(row.lineage ?? [])
    const checkCap = () => {
      if (ancestors.size > MAX_LINEAGE) unionLineage([...ancestors].map((id) => ({ id })))
    }
    checkCap()
    while (pending.length) {
      const id = pending.pop()!
      if (id === row.id) throw new Error(`Cyclic version ancestry at ${row.id}`)
      if (seen.has(id)) continue
      seen.add(id)
      const parent = byId.get(id)
      if (!parent) continue // A deleted or invalid relationship supplies no reconstructable path.
      ancestors.add(parent.id)
      for (const ancestor of parent.lineage ?? []) ancestors.add(ancestor)
      checkCap()
      if (parent.source != null) pending.push(parent.source)
      if (parent.second != null) pending.push(parent.second)
    }
    result.set(row.id, unionLineage([...ancestors].map((id) => ({ id }))))
  }
  return result
}
