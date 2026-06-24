/**
 * Sub-strand ordering, grouping, and search for the Lesson Plans browse page (frontend).
 *
 * The curriculum is two levels deep: a sub-strand (`meta.substrand_id`, e.g. "1.4") is a child of
 * a strand (the first dotted segment, named by `unit.strand`). This module is the pure logic the
 * server component leans on — no Payload/React imports — so the ordering comparator can be unit
 * tested without a DB (see tests/unit/substrand.spec.ts).
 */

/** A bundle reduced to just what the list renders/orders/searches. */
export interface LessonRow {
  id: number | string
  subjectName: string
  grade: number | null
  /** `meta.substrand_id`, e.g. "1.4". May be empty/invalid on bad data. */
  substrandId: string
  substrandName: string
  /** `unit.strand` (strand name); null when UNIT is empty. */
  strandName: string | null
  lessonCount: number
}

export interface StrandGroup {
  key: string
  label: string
  strandNumber: number | null
  rows: LessonRow[]
}

export interface SubjectGradeGroup {
  key: string
  label: string
  subjectName: string
  grade: number | null
  strands: StrandGroup[]
}

/** Parse a dotted id into numeric segments, or null if any segment isn't a number (invalid id). */
function parseSegments(id: string): number[] | null {
  if (!id) return null
  const segs = id.split('.').map((s) => Number(s.trim()))
  return segs.some((n) => !Number.isFinite(n)) ? null : segs
}

/**
 * Order two sub-strand ids by curriculum sequence: dotted-NUMERIC, not lexicographic — so
 * "1.4" < "1.10" and "1.4" < "1.4.1". Invalid/empty ids sort LAST (after all valid ones).
 */
export function compareSubstrandId(a: string, b: string): number {
  const pa = parseSegments(a)
  const pb = parseSegments(b)
  // Invalid/empty ids sort last; two invalids fall back to a stable string compare. The
  // single-variable guards also narrow pa/pb to number[] for the loop (no casts needed).
  if (!pa && !pb) return (a ?? '').localeCompare(b ?? '')
  if (!pa) return 1
  if (!pb) return -1
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    // A missing segment (shorter id) sorts before a present one: "1.4" before "1.4.1".
    const x = pa[i] ?? -Infinity
    const y = pb[i] ?? -Infinity
    if (x !== y) return x - y
  }
  return 0
}

/** The strand number is the first dotted segment of the sub-strand id (null if invalid). */
export function strandNumberOf(substrandId: string): number | null {
  return parseSegments(substrandId)?.[0] ?? null
}

/** Strand numbers ascending; unknown (null) strands sort last. */
function compareStrandNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}

/**
 * The stored `unit.strand` already embeds its own ordinal, e.g. "Strand 2.0: Physiology of Plants".
 * Strip that leading "Strand N[.M]:" prefix so the descriptive name renders once, behind our own
 * (consistent, derived) strand number — avoiding "Strand 2 · Strand 2.0: …" doubling.
 */
export function cleanStrandName(raw: string | null): string {
  if (!raw) return ''
  return raw.replace(/^\s*strand\s+\d+(\.\d+)*\s*:?\s*/i, '').trim()
}

/** "Strand N: Name", degrading to "Strand N", then the bare name, then "Other". */
function strandLabel(strandNumber: number | null, name: string): string {
  if (strandNumber != null) return name ? `Strand ${strandNumber}: ${name}` : `Strand ${strandNumber}`
  return name || 'Other'
}

/**
 * Group rows into subject-grade → strand → sub-strands, each level ordered: subject-grades by
 * subject then grade; strands by number; sub-strands by curriculum sequence. Strand label is
 * "Strand N · Name" (falls back to "Strand N", then the name alone, then "Other").
 */
export function groupLessons(rows: LessonRow[]): SubjectGradeGroup[] {
  const groups = new Map<string, SubjectGradeGroup>()
  for (const r of rows) {
    const sgKey = `${r.subjectName}::${r.grade ?? ''}`
    let sg = groups.get(sgKey)
    if (!sg) {
      sg = {
        key: sgKey,
        subjectName: r.subjectName,
        grade: r.grade,
        label: r.grade != null ? `${r.subjectName} · Grade ${r.grade}` : r.subjectName,
        strands: [],
      }
      groups.set(sgKey, sg)
    }
    const n = strandNumberOf(r.substrandId)
    const stKey = n != null ? `n${n}` : r.strandName ? `s${r.strandName}` : 'other'
    let st = sg.strands.find((s) => s.key === stKey)
    if (!st) {
      st = { key: stKey, label: strandLabel(n, cleanStrandName(r.strandName)), strandNumber: n, rows: [] }
      sg.strands.push(st)
    }
    st.rows.push(r)
  }

  const ordered = [...groups.values()]
  ordered.sort(
    (a, b) => a.subjectName.localeCompare(b.subjectName) || (a.grade ?? 0) - (b.grade ?? 0),
  )
  for (const sg of ordered) {
    sg.strands.sort(
      (a, b) => compareStrandNumber(a.strandNumber, b.strandNumber) || a.label.localeCompare(b.label),
    )
    for (const st of sg.strands) st.rows.sort((a, b) => compareSubstrandId(a.substrandId, b.substrandId))
  }
  return ordered
}

/**
 * A flat list of rows in the SAME curriculum order as the grouped catalogue (subject-grade →
 * strand → sub-strand). Search renders a flat list but must not fall back to Payload's default
 * order — it reuses `groupLessons` so the two views can never drift on ordering.
 */
export function orderLessons(rows: LessonRow[]): LessonRow[] {
  return groupLessons(rows).flatMap((sg) => sg.strands.flatMap((st) => st.rows))
}

/** The fields search looks at — deliberately modest (no lesson-body text). */
export function bundleSearchText(r: LessonRow): string {
  return [
    r.substrandId,
    r.substrandName,
    r.strandName ?? '',
    r.subjectName,
    // "grade 10" already contains "10" as a substring, so a bare-number query still matches.
    r.grade != null ? `grade ${r.grade}` : '',
  ]
    .join(' ')
    .toLowerCase()
}

/** Whitespace-tokenised AND match over the modest search fields (every token must appear). */
export function matchesQuery(r: LessonRow, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const text = bundleSearchText(r)
  return tokens.every((t) => text.includes(t))
}
