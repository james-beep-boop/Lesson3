/**
 * Numeric id from a Payload relationship value — an id number, a populated `{ id }` object, or
 * null/undefined. Returns null when there's no id. Generic over `unknown` so it works on any
 * relationship field (frontend pages, scripts), unlike `access/index.ts`'s `toId`, which is typed
 * to the SubjectGrade ref and returns `undefined`.
 */
export const relId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return Number((value as { id: unknown }).id)
  return null
}

/**
 * The distinct, non-null ids from a list of `relId` results — the input to a `where: { id: { in: … } }`
 * lookup. Lives beside `relId` because it is only ever fed by it.
 *
 * The type guard is the point: without it a null slips into the `in` array and reaches Postgres as
 * `id IN (NULL)`, which matches nothing silently. Written out by hand at each lookup site (twice, in
 * two files, after the second `depth: 0` rewrite) before being named here.
 */
export const distinctIds = (ids: (number | null)[]): number[] => [
  ...new Set(ids.filter((id): id is number => id != null)),
]
