import type { TextField, TextareaField } from 'payload'

import { canEditProse } from '../access/bundle'

/**
 * Field factories for the sub-strand bundle. The editor's grammar is a strict subset
 * of the ARES generator's input grammar (SPEC §4): every content field is a plain
 * string, `\n` = new paragraph, a line starting with `- ` = bullet, and NO inline
 * markup is parsed. Encoding that once here keeps it consistent across ~40 fields.
 */

const GRAMMAR_HINT =
  'Plain text only. A new line starts a new paragraph; a line beginning with "- " becomes a bullet. Markdown/bold/italic are NOT rendered.'

/**
 * Prose value (SPEC §5). `prose()` only carries the grammar hint + `canEditProse` (for
 * UI/create); the actual Editor/admin split is enforced by the WHITELIST in
 * `applyEditorFieldSplit` (hooks/fieldSplit.ts) — a field is Editor-editable only if it is listed in that
 * hook's prose constants, regardless of which factory created it.
 */
export const prose = (name: string, label: string, description?: string): TextareaField => ({
  name,
  type: 'textarea',
  label,
  admin: {
    description: description ? `${description} — ${GRAMMAR_HINT}` : GRAMMAR_HINT,
  },
  access: { update: canEditProse },
})

/**
 * Admin-only multiline prose — same grammar as `prose`. For answer keys (SPEC §5),
 * e.g. `sections[].exemplar`. NOTE: admin-only enforcement lives in the
 * `applyEditorFieldSplit` whitelist (hooks/fieldSplit.ts), NOT field-level access: Payload's
 * field access nulls optional admin-only subfields inside open arrays when a non-admin
 * submits the array, which would wipe answer keys. Because the hook is a whitelist, any
 * field NOT created via `prose()` is admin-only by default.
 */
export const proseAdmin = (name: string, label: string, description?: string): TextareaField => ({
  name,
  type: 'textarea',
  label,
  admin: {
    description: description ? `${description} — ${GRAMMAR_HINT}` : GRAMMAR_HINT,
  },
})

/** Structural / admin-only text (SPEC §5). Enforced by `applyEditorFieldSplit` (hooks/fieldSplit.ts), not
 *  field access — see the note on `proseAdmin`. */
export const structureText = (
  name: string,
  label: string,
  description?: string,
): TextField => ({
  name,
  type: 'text',
  label,
  ...(description ? { admin: { description } } : {}),
})
