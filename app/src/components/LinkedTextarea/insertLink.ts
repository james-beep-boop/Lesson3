import { hasParenthesizedUrl } from '../../lib/proseLinkTokens'

/** Insert a parenthesized address, separating a label from surrounding words. */
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
  const before = value.slice(0, safeCursor)
  const after = value.slice(safeCursor)
  const prefix = label.trim() && before && !/[\s([{]$/.test(before) ? ' ' : ''
  const suffix = label.trim() && after && !/^[\s.,;:!?)}\]]/.test(after) ? ' ' : ''
  return {
    value: `${before}${prefix}${insertion}${suffix}${after}`,
    cursor: safeCursor + prefix.length + insertion.length + suffix.length,
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
  if (hasParenthesizedUrl(label))
    return 'Keep web addresses out of the label. Use the Web address box.'
  if (/^(?:- |\|)/.test(label.trimStart()))
    return 'A label can\'t start with "- " or "|". Those turn the line into a bullet or a table.'
  return null
}
