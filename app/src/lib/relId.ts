/**
 * Numeric id from a Payload relationship value — an id number, a digit string, a populated `{ id }`
 * object, or null/undefined. Returns null when there's no id. Generic over `unknown` so it works on
 * any relationship field (frontend pages, scripts), unlike `access/index.ts`'s `toId`, which is typed
 * to the SubjectGrade ref and returns `undefined`.
 *
 * ⚑ DIGIT STRINGS ARE IDS (2026-10-09). Payload converts a string relationship id to a number only when
 * the related collection declares its own numeric `id` field (installed
 * `fields/hooks/beforeValidate/promise.js`); with default serial ids, a REST body's `"12"` reaches
 * collection hooks as a string. Reading that as null silently dropped references clients really sent,
 * and made equality checks against numeric ids fail. Only `^\d+$` qualifies — `" 12 "`, `"1e1"` and
 * `"0x0c"` are not ids, and an `{ id }` that is not one yields null rather than NaN.
 */
const fromId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return null
}

export const relId = (value: unknown): number | null => {
  if (value && typeof value === 'object' && 'id' in value) {
    return fromId((value as { id: unknown }).id)
  }
  return fromId(value)
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
