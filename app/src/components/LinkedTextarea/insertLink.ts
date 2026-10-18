/** Insert a labelled parenthesized address without changing any surrounding prose. */
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

/** Shared complete HTTP/HTTPS parser. URL normalization escapes spaces and canonicalizes hosts. */
export function parseExternalUrl(value: string): URL | null {
  const address = value.trim()
  if (!/^https?:\/\//i.test(address) || /[\r\n\t]/.test(address)) return null
  try {
    return new URL(address)
  } catch {
    return null
  }
}

export function validExternalUrl(value: string): string | null {
  return parseExternalUrl(value)?.href ?? null
}

export function labelError(label: string): string | null {
  if (/[\r\n]/.test(label)) return 'Keep the label on one line.'
  if (label.trim().length > 120) return 'Keep the label to 120 characters or fewer.'
  return null
}
