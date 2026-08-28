import type { FormState, Row } from 'payload'

export type CollapseRowsAction = {
  path: string
  type: 'SET_ALL_ROWS_COLLAPSED'
  updatedRows: Row[]
}

/**
 * Build the form actions that make a newly opened lesson editor start collapsed.
 *
 * Payload gives stored per-user row preferences precedence over each array's `initCollapsed` value.
 * That is useful in a general-purpose admin form, but it makes an old "Show All" choice turn into the
 * opening state of every later lesson plan. The editor's rule is narrower: each visit starts compact,
 * then the caller may expand whatever they need for the rest of that visit.
 *
 * `null` means the required top-level Lessons array has not reached form state yet. An empty action
 * list means the form is ready and every array row is already collapsed.
 */
export function initialCollapseActions(fields: FormState): CollapseRowsAction[] | null {
  if (!Array.isArray(fields.lessons?.rows)) return null

  const actions: CollapseRowsAction[] = []

  for (const [path, field] of Object.entries(fields)) {
    if (!Array.isArray(field.rows) || field.rows.every((row) => row.collapsed === true)) continue

    actions.push({
      path,
      type: 'SET_ALL_ROWS_COLLAPSED',
      updatedRows: field.rows.map((row) => ({ ...row, collapsed: true })),
    })
  }

  return actions
}
