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
type Hunk = { start: number; end: number; lines: string[] }

/** Above this many LCS cells the merge gives up and reports a conflict (≈ 1000 × 1000 lines). */
const MAX_CELLS = 1_000_000

/** Shared by every prose field in one preview, including hunk comparisons. */
export type MergeBudget = { remaining: number }
export const createMergeBudget = (): MergeBudget => ({ remaining: 2_000_000 })
const MAX_TEXT_CHARS = 1_000_000
const MAX_OUTPUT_LINES = 200_000

const spend = (budget: MergeBudget, work: number): boolean => {
  if (work > budget.remaining) return false
  budget.remaining -= work
  return true
}

/** The hunks that turn `base` into `side`, in base order. Null when the input is too large. */
const diffHunks = (base: string[], side: string[], budget: MergeBudget): Hunk[] | null => {
  const n = base.length
  const m = side.length
  const cells = (n + 1) * (m + 1)
  if (cells > MAX_CELLS || !spend(budget, cells)) return null

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
  // Every hunk opened below consumes a base line or adds a side line, so none is ever empty.
  const flush = () => {
    if (open) hunks.push(open)
    open = null
  }
  while (i < n || j < m) {
    if (i < n && j < m && base[i] === side[j]) {
      flush()
      i++
      j++
      continue
    }
    open ??= { start: i, end: i, lines: [] }
    if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      open.lines.push(side[j])
      j++
    } else {
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

type Merge3Result = { ok: true; text: string } | { ok: false }

/**
 * Merge `a` and `b`, both edited from `base`, one line per paragraph. `ok: false` is a conflict:
 * the caller shows the field to a person rather than guessing.
 */
export const merge3 = (
  base: string,
  a: string,
  b: string,
  budget = createMergeBudget(),
): Merge3Result => {
  if (budget.remaining <= 0 || [base, a, b].some((text) => text.length > MAX_TEXT_CHARS)) {
    return { ok: false }
  }
  const baseLines = base.split('\n')
  const ha = diffHunks(baseLines, a.split('\n'), budget)
  if (!ha) return { ok: false }
  const hb = diffHunks(baseLines, b.split('\n'), budget)
  if (!ha || !hb) return { ok: false }
  if (!spend(budget, 2 * ha.length * hb.length)) return { ok: false }

  const applied: Hunk[] = [...ha]
  for (const y of hb) {
    if (ha.some((x) => sameHunk(x, y))) continue // the same change on both sides applies once
    if (ha.some((x) => clash(x, y))) return { ok: false }
    applied.push(y)
  }
  applied.sort((x, y) => x.start - y.start)

  const out: string[] = []
  let chars = 0
  const append = (lines: string[], start = 0, end = lines.length): boolean => {
    for (let i = start; i < end; i++) {
      chars += lines[i].length + (out.length ? 1 : 0)
      if (chars > MAX_TEXT_CHARS || out.length >= MAX_OUTPUT_LINES) return false
      out.push(lines[i])
    }
    return true
  }
  let at = 0
  for (const h of applied) {
    if (!append(baseLines, at, h.start) || !append(h.lines)) return { ok: false }
    at = h.end
  }
  if (!append(baseLines, at)) return { ok: false }
  return { ok: true, text: out.join('\n') }
}
