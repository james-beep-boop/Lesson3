/**
 * Paragraph-level three-way merge for ONE prose field (SPEC §6 "Combine versions").
 *
 * The editor grammar makes a line the natural unit: `\n` separates paragraphs and a leading `- `
 * makes a line a bullet (CLAUDE.md). So two teachers who edited DIFFERENT paragraphs of the same
 * field combine cleanly, and two who edited the SAME paragraph conflict and a person chooses.
 *
 * ⚑ NO CHARACTER-LEVEL MERGING, deliberately. Merging inside a paragraph can splice two rewrites
 * into a sentence neither teacher wrote, and nothing on screen would say so. A conflict costs a
 * click; a silently garbled teaching instruction costs a lesson.
 *
 * ⚑ WHEN IS IT A CONFLICT. A hunk replaces a range of BASE lines `[start, end)` with new lines (an
 * empty range is an insertion). Two hunks — one per side — conflict when:
 *   - their ranges overlap, or
 *   - either is an insertion at a point inside or on the edge of the other (whose text comes
 *     first is a choice, not a fact), including two insertions at the same point;
 * unless they are identical, in which case both teachers made the same change and it applies once.
 * Two edits to ADJACENT paragraphs (`a.end === b.start`, both non-empty) do not conflict.
 *
 * Pure, dependency-free. LCS by dynamic programming: prose fields are at most a few dozen lines, and
 * {@link MAX_CELLS} bounds the table so a pathological input is reported as a conflict rather than
 * allocating without limit.
 */

/** Replace `base[start, end)` with `lines`. */
export type Hunk = { start: number; end: number; lines: string[] }

/** Above this many LCS cells the merge gives up and reports a conflict (≈ 1000 × 1000 lines). */
export const MAX_CELLS = 1_000_000

/** The hunks that turn `base` into `side`, in base order. Null when the input is too large. */
export const diffHunks = (base: string[], side: string[]): Hunk[] | null => {
  const n = base.length
  const m = side.length
  if ((n + 1) * (m + 1) > MAX_CELLS) return null

  // lcs[i][j] = LCS length of base[i..] and side[j..], filled from the end.
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        base[i] === side[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const hunks: Hunk[] = []
  let i = 0
  let j = 0
  let open: Hunk | null = null
  const flush = () => {
    if (open && (open.end > open.start || open.lines.length > 0)) hunks.push(open)
    open = null
  }
  while (i < n || j < m) {
    if (i < n && j < m && base[i] === side[j]) {
      flush()
      i++
      j++
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      open ??= { start: i, end: i, lines: [] }
      open.lines.push(side[j])
      j++
    } else {
      open ??= { start: i, end: i, lines: [] }
      i++
      open.end = i
    }
  }
  flush()
  return hunks
}

const sameHunk = (x: Hunk, y: Hunk): boolean =>
  x.start === y.start &&
  x.end === y.end &&
  x.lines.length === y.lines.length &&
  x.lines.every((line, k) => line === y.lines[k])

/** Whether two hunks from different sides touch the same text (see the header for the rule). */
const clash = (x: Hunk, y: Hunk): boolean => {
  if (x.start < y.end && y.start < x.end) return true
  const insideOrEdge = (point: number, h: Hunk) => h.start <= point && point <= h.end
  if (x.start === x.end && insideOrEdge(x.start, y)) return true
  if (y.start === y.end && insideOrEdge(y.start, x)) return true
  return false
}

export type Merge3Result = { ok: true; text: string } | { ok: false }

/**
 * Merge `a` and `b`, both edited from `base`, one line per paragraph. `ok: false` is a conflict:
 * the caller shows the field to a person rather than guessing.
 */
export const merge3 = (base: string, a: string, b: string): Merge3Result => {
  const baseLines = base.split('\n')
  const ha = diffHunks(baseLines, a.split('\n'))
  const hb = diffHunks(baseLines, b.split('\n'))
  if (!ha || !hb) return { ok: false }

  const applied: Hunk[] = [...ha]
  for (const y of hb) {
    const twin = ha.find((x) => sameHunk(x, y))
    if (twin) continue // the same change on both sides applies once
    if (ha.some((x) => clash(x, y))) return { ok: false }
    applied.push(y)
  }
  applied.sort((x, y) => x.start - y.start)

  const out: string[] = []
  let at = 0
  for (const h of applied) {
    out.push(...baseLines.slice(at, h.start), ...h.lines)
    at = h.end
  }
  out.push(...baseLines.slice(at))
  return { ok: true, text: out.join('\n') }
}
