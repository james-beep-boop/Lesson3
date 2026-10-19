/** Plain-text link grammar shared by insertion validation and document rendering. */
export type LinkToken = { kind: 'link'; url: string } | { kind: 'text'; text: string }

const safeHttpUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

/** Pure tokenization is exported for the fast scheme/punctuation regression tests. */
export function tokenizeParenthesizedUrls(text: string): LinkToken[] {
  const tokens: LinkToken[] = []
  let cursor = 0
  const start = /\(https?:\/\//gi
  let match: RegExpExecArray | null
  while ((match = start.exec(text))) {
    const index = match.index
    let end = index + 1
    let depth = 1
    // Parentheses are legal URL characters. Match the enclosing pair without truncating
    // existing Wikipedia-style paths, and stop malformed candidates at prose boundaries.
    for (; end < text.length; end++) {
      const char = text[end]
      if (/\s|[<>]/.test(char)) break
      if (char === '(') depth++
      if (char === ')' && --depth === 0) break
    }
    start.lastIndex = end + 1
    if (depth !== 0) continue
    const url = safeHttpUrl(text.slice(index + 1, end))
    if (!url) continue
    if (index > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, index) })
    tokens.push({ kind: 'text', text: '(' }, { kind: 'link', url }, { kind: 'text', text: ')' })
    cursor = end + 1
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) })
  return tokens.length > 0 ? tokens : [{ kind: 'text', text }]
}

export const hasParenthesizedUrl = (text: string): boolean =>
  tokenizeParenthesizedUrls(text).some((token) => token.kind === 'link')
