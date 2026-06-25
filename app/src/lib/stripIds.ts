/**
 * Deep-clone a value, dropping every nested `id` key. Used when copying stored content into a NEW
 * document (forking a working version, backfilling a bundle into a version): array-row `id`s belong
 * to the source rows, so they must not carry into the copy — Payload assigns fresh ones on create.
 */
export const stripIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripIds)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'id') continue
      out[k] = stripIds(v)
    }
    return out
  }
  return value
}
