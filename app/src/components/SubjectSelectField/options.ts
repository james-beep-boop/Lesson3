import type { OptionObject } from 'payload'

/** Taxonomy names as options; a stored value NOT in the taxonomy (legacy / since-renamed subject)
 *  is kept displayable and re-selectable — flagged, never blanked or silently rewritten.
 *  Separate module so tests can import it without dragging in `@payloadcms/ui` (CSS deps). */
export const buildSubjectOptions = (
  subjects: string[],
  value: string | null | undefined,
): OptionObject[] => {
  const options: OptionObject[] = subjects.map((name) => ({ label: name, value: name }))
  if (value && !subjects.includes(value)) {
    options.unshift({ label: `${value} (not in taxonomy)`, value })
  }
  return options
}
