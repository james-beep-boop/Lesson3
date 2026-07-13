/**
 * In-page navigation anchors for the rendered lesson document (design critique 2026-07-12,
 * cross-cutting issue #2: an 8-lesson document renders as one continuous scroll with no way to
 * jump to a lesson).
 *
 * The content view is mammoth-converted generator DOCX (SPEC §5 — derived from generator output,
 * never a parallel renderer), so lesson boundaries are NOT headings: each lesson opens a new
 * table whose first row is the generator's `fullHeader` cell, which mammoth renders as
 * `<p><strong>LESSON <n> (<duration>): <title></strong></p>` (vendor/lib/sections.js `sectionA`).
 * This helper injects an `id="lesson-<n>"` onto that paragraph and reports the anchors found, so
 * pages can render a jump nav. It runs AFTER the sanitized HTML leaves the render cache — a pure
 * per-request string transform — so cached entries are untouched and HTML_RENDER_CACHE_VERSION
 * does not move. `lessonAnchors.spec.ts` pins the mammoth output shape so a generator/mammoth
 * bump that changes it fails fast instead of silently dropping the nav.
 */

export interface LessonAnchor {
  /** Element id injected into the HTML, e.g. `lesson-3`. */
  id: string
  number: number
  /** Entity-decoded lesson title, for link labels/tooltips. */
  title: string
}

/** Stable section-container id for a rendered document section label ("Lesson Sequence" → `doc-lesson-sequence`). */
export const docSectionId = (label: string): string =>
  `doc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

/** The only entities the pipeline produces in titles: prose is plain text that mammoth escapes. */
const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const LESSON_HEADER = /<p><strong>LESSON (\d+) \((.*?)\): (.*?)<\/strong><\/p>/g

/**
 * Inject `id="lesson-<n>"` on each lesson-header paragraph and list the anchors found, in
 * document order. Duplicate lesson numbers (malformed data) keep only the first occurrence so
 * ids stay unique; HTML without lesson headers passes through unchanged with no anchors.
 */
export function annotateLessonAnchors(html: string): { html: string; anchors: LessonAnchor[] } {
  const anchors: LessonAnchor[] = []
  const seen = new Set<number>()
  const annotated = html.replace(LESSON_HEADER, (match, num: string, _duration, title: string) => {
    const number = Number(num)
    if (seen.has(number)) return match
    seen.add(number)
    const id = `lesson-${number}`
    anchors.push({ id, number, title: decodeEntities(title) })
    return match.replace('<p>', `<p id="${id}">`)
  })
  return { html: annotated, anchors }
}
