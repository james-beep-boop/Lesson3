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
