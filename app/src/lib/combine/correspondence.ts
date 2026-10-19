import { canonicalJson } from '../canonicalJson'
import { asDoc, asRows } from '../editRecovery/projection'
import { stripIds } from '../stripIds'

type Doc = Record<string, unknown>

/** Positions are usable only when distinct row identifiers still occur in the same order.
 * Lesson numbers are deliberately excluded: a reorder can renumber them. Lesson identity uses
 * system-owned upload data; editable lesson titles cannot establish correspondence.
 * A resource update may use the remaining upload keys only when the caller has a usable ancestor
 * and those keys are unique and unchanged. Repeated phases/section titles remain ambiguous.
 */
const sameRows = (a: Doc[], b: Doc[], identity: (row: Doc) => unknown): boolean => {
  if (a.length !== b.length) return false
  const keys = a.map((row) => canonicalJson(identity(row)))
  return (
    new Set(keys).size === keys.length &&
    keys.every((key, i) => key === canonicalJson(identity(b[i])))
  )
}

export const rowsCorrespond = (
  a: Doc,
  b: Doc,
  { allowResourceChanges = false }: { allowResourceChanges?: boolean } = {},
): boolean => {
  const la = asRows(a.lessons)
  const lb = asRows(b.lessons)
  const uploadKey = (row: Doc) => ({
    substrand: row.substrand ?? null,
    aresKeywords: row.aresKeywords ?? null,
  })
  // Preserve the existing stricter identity, including plans whose keywords repeat but resources
  // distinguish lessons. A release may change resources only when the remaining keys are unique
  // and unchanged in order; ancestry never makes an ambiguous or reordered row safe to pair.
  const strictMatch = sameRows(la, lb, (row) => ({
    ...uploadKey(row),
    resourceLinks: stripIds(row.resourceLinks ?? null),
  }))
  if (!strictMatch && !(allowResourceChanges && sameRows(la, lb, uploadKey))) return false
  if (
    !la.every((row, i) =>
      sameRows(asRows(row.framework), asRows(lb[i].framework), (fw) => fw.phase ?? null),
    )
  )
    return false
  if (
    !sameRows(
      asRows(asDoc(a.finalExplanation)?.sections),
      asRows(asDoc(b.finalExplanation)?.sections),
      (row) => row.title ?? null,
    )
  )
    return false
  return sameRows(
    asRows(asDoc(a.summaryTable)?.lessons),
    asRows(asDoc(b.summaryTable)?.lessons),
    (row) => row.title ?? null,
  )
}
