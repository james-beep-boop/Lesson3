/**
 * Format a collapsed array row without repeating the generated prefix when the stored title already
 * contains it. Imported lesson bundles commonly use titles such as "Section 1 — The Foundation";
 * the row label already supplies "Section 1", so showing both was redundant.
 */
const firstLine = (value: string): string => value.trim().split('\n')[0]!.trim()

const truncate = (value: string, max = 60): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function formatRowLabel(noun: string, rowNumber: number, rawValue: unknown): string {
  const prefix = `${noun} ${rowNumber}`
  if (typeof rawValue !== 'string' || !rawValue.trim()) return prefix

  // Match only this row's complete generated prefix. The boundary prevents "Section 1" from
  // consuming "Section 10", while accepting the separators found in generated and imported data.
  const duplicatePrefix = new RegExp(
    `^${escapeRegExp(prefix)}(?:\\s*(?:—|–|-)\\s*|\\s*:\\s*|\\s+|$)`,
    'i',
  )
  const value = firstLine(rawValue).replace(duplicatePrefix, '').trim()

  return value ? `${prefix} — ${truncate(value)}` : prefix
}
