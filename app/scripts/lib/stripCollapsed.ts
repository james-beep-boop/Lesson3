/**
 * Remove stored ROW-COLLAPSE state from a Payload preference document's `value`, leaving every other
 * stored preference untouched. The transform half of `scripts/clear-editor-collapse-prefs.ts` — it
 * lives here, apart from the script, because that script boots Payload at import time and so cannot be
 * imported by a unit test.
 *
 * Removing the key (rather than emptying it) is what matters: `isRowCollapsed`
 * (`@payloadcms/ui/dist/forms/fieldSchemasToFormState/isRowCollapsed.js`) gates on
 * `collapsedPrefs !== undefined`, so an EMPTY array still suppresses `initCollapsed` and renders every
 * row expanded. Only an absent value restores the fallback.
 */

type PreferenceValue = { fields?: Record<string, Record<string, unknown>> }

export interface StripResult {
  /** The rewritten value — the SAME reference when nothing changed, so callers can skip the write. */
  value: unknown
  /** Field paths whose collapse state was removed. */
  stripped: string[]
}

export const stripCollapsed = (value: unknown): StripResult => {
  const fields = (value as PreferenceValue | null)?.fields
  if (!fields || typeof fields !== 'object') return { value, stripped: [] }

  const stripped: string[] = []
  const nextFields: Record<string, Record<string, unknown>> = {}
  for (const [path, entry] of Object.entries(fields)) {
    if (entry && typeof entry === 'object' && 'collapsed' in entry) {
      const { collapsed: _collapsed, ...rest } = entry
      stripped.push(path)
      nextFields[path] = rest
    } else {
      nextFields[path] = entry
    }
  }
  return stripped.length === 0
    ? { value, stripped }
    : { value: { ...(value as object), fields: nextFields }, stripped }
}
