/** Insert the proof-of-concept link notation without changing any surrounding prose. */
export function insertParenthesizedUrl(
  value: string,
  cursor: number,
  url: string,
): {
  cursor: number
  value: string
} {
  const safeCursor = Math.max(0, Math.min(cursor, value.length))
  const insertion = `(${url})`
  return {
    value: `${value.slice(0, safeCursor)}${insertion}${value.slice(safeCursor)}`,
    cursor: safeCursor + insertion.length,
  }
}

/** Internet entries are deliberately HTTPS-only; Rock PDFs use a server-issued same-origin URL. */
export function validExternalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
