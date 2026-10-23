import type { FormState } from 'payload'

/** Human positions replace internal zero-based paths in the save summary. */
export function fieldErrorMessage(path: string, message: string): string {
  const phase = /^lessons\.(\d+)\.framework\.(\d+)\.phase$/.exec(path)
  if (phase)
    return `Lesson ${Number(phase[1]) + 1}, phase ${Number(phase[2]) + 1}: Choose a phase from the list.`
  if (/^Lesson \d+/.test(message)) return message
  const lesson = /^lessons\.(\d+)\.(.+)$/.exec(path)
  const label = lesson ? `Lesson ${Number(lesson[1]) + 1} — ${lesson[2]}` : path
  return label ? `${label}: ${message}` : message
}

export function invalidFields(fields: FormState): { path: string; message: string }[] {
  return Object.entries(fields)
    .filter(([, field]) => field.valid === false && field.passesCondition !== false)
    .map(([path, field]) => ({
      path,
      message: fieldErrorMessage(path, field.errorMessage || 'Check this field.'),
    }))
}

/** The generic Payload heading is not the explanation; nested errors carry the reasons. */
export function requestErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const errors = (body as { errors?: unknown }).errors
  if (!Array.isArray(errors)) return fallback
  const messages = errors.flatMap((error: unknown): string[] => {
    if (!error || typeof error !== 'object') return []
    const entry = error as { message?: unknown; path?: unknown; data?: { errors?: unknown } }
    if (Array.isArray(entry.data?.errors)) {
      return entry.data.errors.flatMap((detail: unknown): string[] => {
        if (!detail || typeof detail !== 'object') return []
        const field = detail as { path?: unknown; message?: unknown }
        return typeof field.message === 'string'
          ? [fieldErrorMessage(typeof field.path === 'string' ? field.path : '', field.message)]
          : []
      })
    }
    return typeof entry.message === 'string'
      ? [fieldErrorMessage(typeof entry.path === 'string' ? entry.path : '', entry.message)]
      : []
  })
  return [...new Set(messages)].join('\n') || fallback
}

/** Open enclosing rows without changing unrelated rows' collapsed state. */
export function rowsToReveal(path: string, fields: FormState) {
  const parts = path.split('.')
  return parts.flatMap((part, i) => {
    if (!/^\d+$/.test(part)) return []
    const parent = parts.slice(0, i).join('.')
    const rows = fields[parent]?.rows
    return Array.isArray(rows)
      ? [
          {
            type: 'SET_ALL_ROWS_COLLAPSED' as const,
            path: parent,
            updatedRows: rows.map((row, index) =>
              index === Number(part) ? { ...row, collapsed: false } : row,
            ),
          },
        ]
      : []
  })
}

export function focusField(path: string) {
  let attempts = 0
  const reveal = () => {
    const field =
      document.getElementById(`field-${path.replaceAll('.', '__')}`) ||
      document.getElementsByName(path)[0]
    const input = field?.matches('input, select, textarea, button')
      ? field
      : field?.querySelector<HTMLElement>('input, select, textarea, button')
    if (
      input instanceof HTMLElement &&
      !input.hasAttribute('disabled') &&
      !input.closest('.collapsible--collapsed') &&
      input.getClientRects().length > 0
    ) {
      input.focus({ preventScroll: true })
      if (document.activeElement === input) {
        input.scrollIntoView({ block: 'center' })
        return
      }
    }
    if (attempts++ < 120) window.requestAnimationFrame(reveal)
  }
  window.requestAnimationFrame(reveal)
}
