import type { TextField, TextareaField } from 'payload'

import { canEditProse } from '../access/bundle'

/**
 * Field factories for the sub-strand bundle. The editor's plain-text grammar is
 * explained once in LessonControls' "Help" dialog instead of being repeated
 * beneath roughly forty fields. These factories still carry the access-control split.
 */

/**
 * Prose value (SPEC §5). `prose()` carries `canEditProse` for UI/create; the actual
 * editing-access/admin split is enforced by the WHITELIST in
 * `applyEditorFieldSplit` (hooks/fieldSplit.ts) — a field is editing-access-editable only if it is listed in that
 * hook's prose constants, regardless of which factory created it.
 */
const linkComponent = {
  components: { Field: '@/components/LinkedTextarea#default' },
}

export const prose = (
  name: string,
  label: string,
  options: { linkable?: boolean } = {},
): TextareaField => ({
  name,
  type: 'textarea',
  label,
  access: { update: canEditProse },
  ...(options.linkable === false ? {} : { admin: linkComponent }),
})

/**
 * Admin-only multiline prose. For answer keys (SPEC §5),
 * e.g. `sections[].exemplar`. NOTE: admin-only enforcement lives in the
 * `applyEditorFieldSplit` whitelist (hooks/fieldSplit.ts), NOT field-level access: Payload's
 * field access nulls optional admin-only subfields inside open arrays when a non-admin
 * submits the array, which would wipe answer keys. Because the hook is a whitelist, any
 * field NOT created via `prose()` is admin-only by default.
 */
export const proseAdmin = (name: string, label: string): TextareaField => ({
  name,
  type: 'textarea',
  label,
  admin: linkComponent,
})

/** Structural / admin-only text (SPEC §5). Enforced by `applyEditorFieldSplit` (hooks/fieldSplit.ts), not
 *  field access — see the note on `proseAdmin`. */
export const structureText = (name: string, label: string, description?: string): TextField => ({
  name,
  type: 'text',
  label,
  ...(description ? { admin: { description } } : {}),
})
