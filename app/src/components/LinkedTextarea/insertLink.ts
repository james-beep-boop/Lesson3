/** Insert the proof-of-concept link notation without changing any surrounding prose. */
export function insertParenthesizedUrl(
  value: string,
  cursor: number,
  url: string,
  label = '',
): {
  cursor: number
  value: string
} {
  const safeCursor = Math.max(0, Math.min(cursor, value.length))
  // Encode delimiters for new links, including legal URLs with an unmatched parenthesis.
  const insertion = `${label.trim() ? `${label.trim()} ` : ''}(${url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`
  return {
    value: `${value.slice(0, safeCursor)}${insertion}${value.slice(safeCursor)}`,
    cursor: safeCursor + insertion.length,
  }
}

/** Preserve accepted addresses as typed (apart from surrounding whitespace). */
export function validExternalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return /^https?:\/\//i.test(value.trim()) &&
      !/\s/.test(value.trim()) &&
      ['http:', 'https:'].includes(url.protocol)
      ? value.trim()
      : null
  } catch {
    return null
  }
}

export function labelError(label: string): string | null {
  if (/[\r\n]/.test(label)) return 'Keep the label on one line.'
  if (label.trim().length > 120) return 'Keep the label to 120 characters or fewer.'
  return null
}
