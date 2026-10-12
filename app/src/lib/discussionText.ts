/**
 * The forum's pure text rules — safe to import from client components (no Payload, no database).
 *
 * `lib/discussions.ts` holds the server rules and re-exports `escapeLike` and `refLabelFor` from here, so
 * the server and the reference picker in the browser build the same label and the same search pattern.
 */
export { versionReferenceLabel as refLabelFor } from './lessonReference'

/** Text limits (§16.2): a title, and a post or reply (the same as `messages.body`). */
export const MAX_TITLE_LENGTH = 150
export const MAX_BODY_LENGTH = 5000

/** Make `%`, `_` and `\` literal in a LIKE pattern. Payload's `like` does not escape them (spike 2026-10-09). */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Longest search text honoured — bounds the query, not the reader. */
export const MAX_SEARCH_LENGTH = 200

/**
 * The value for Payload's `like` that requires EVERY typed word, in any order, case-insensitive: Payload's
 * `like` already splits on spaces and requires each word; this bounds the length, collapses whitespace
 * and escapes the LIKE wildcards. Null for an empty search. ONE rule for the forum's title search and the
 * reference picker's lesson search.
 */
export function likeAllWords(query: string): string | null {
  const words = query.slice(0, MAX_SEARCH_LENGTH).trim().split(/\s+/).filter(Boolean)
  return words.length ? words.map(escapeLike).join(' ') : null
}

// ─── Plain text with safe links (§16.4 "Links in text") ────────────────────────────────────────────

export type TextSegment =
  { kind: 'text'; text: string } | { kind: 'link'; href: string; text: string }

const URL_CANDIDATE = /https?:\/\/[^\s<>"]+/gi
// Punctuation that ends a sentence rather than a URL: "see https://x.org." links `https://x.org`.
const TRAILING = /[.,;:!?'"’”]$/

/** Drop sentence punctuation, and closing brackets the URL did not open, from the end of a candidate. */
function trimCandidate(raw: string): string {
  let url = raw
  for (;;) {
    if (TRAILING.test(url)) {
      url = url.slice(0, -1)
      continue
    }
    const last = url.at(-1)
    const pair = last === ')' ? '(' : last === ']' ? '[' : null
    if (pair && url.split(pair).length < url.split(last!).length) {
      url = url.slice(0, -1)
      continue
    }
    return url
  }
}

/** The href to link, or null when the candidate is not an http(s) URL with a host. */
function safeHref(candidate: string): string | null {
  try {
    const url = new URL(candidate)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null
    return url.href
  } catch {
    return null
  }
}

/**
 * Split one line into text and link segments. Only `http`/`https` URLs become links; everything else —
 * including anything that looks like HTML — stays text, and is rendered as a text node, never as markup.
 */
export function linkify(line: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0
  for (const match of line.matchAll(URL_CANDIDATE)) {
    const start = match.index
    const candidate = trimCandidate(match[0])
    const href = safeHref(candidate)
    if (!href) continue
    if (start > cursor) segments.push({ kind: 'text', text: line.slice(cursor, start) })
    segments.push({ kind: 'link', href, text: candidate })
    cursor = start + candidate.length
  }
  if (cursor < line.length) segments.push({ kind: 'text', text: line.slice(cursor) })
  return segments
}

/** A post's paragraphs: `\n` separates them (§16.4), and blank lines carry nothing. */
export const paragraphsOf = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
