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

/** The one section label whose HTML carries lesson headers (docxToSections' LessonSequence). */
export const LESSON_SEQUENCE_LABEL = 'Lesson Sequence'

export interface AnnotatedSection {
  label: string
  html: string
  anchors: LessonAnchor[]
}

/**
 * Annotate a rendered version's sections for the jump nav: only the Lesson Sequence can carry
 * lesson headers, so only it is scanned — the other documents pass through with no anchors.
 */
export function annotateSections(
  sections: { label: string; html: string }[],
): AnnotatedSection[] {
  return sections.map((s) =>
    s.label === LESSON_SEQUENCE_LABEL
      ? { label: s.label, ...annotateLessonAnchors(s.html) }
      : { label: s.label, html: s.html, anchors: [] },
  )
}

export type DocNavItem =
  | { kind: 'section'; href: string; text: string }
  | { kind: 'lessons-label'; text: string }
  | { kind: 'lesson'; href: string; text: string; tooltip: string }

/**
 * THE cross-surface jump-nav model — the lesson page (JSX) and the standalone preview page
 * (HTML string) both render exactly this item list, so the rules (the Lesson Sequence link reads
 * "Overview" because that document opens with the sub-strand overview table; the "Lessons" label
 * and numbered chips appear only when anchors matched) live in one place and cannot drift
 * between surfaces.
 */
export function docNavItems(sections: AnnotatedSection[]): DocNavItem[] {
  const items: DocNavItem[] = []
  for (const s of sections) {
    const isSequence = s.label === LESSON_SEQUENCE_LABEL
    items.push({
      kind: 'section',
      href: `#${docSectionId(s.label)}`,
      text: isSequence ? 'Overview' : s.label,
    })
    if (isSequence && s.anchors.length > 0) {
      items.push({ kind: 'lessons-label', text: 'Lessons' })
      for (const a of s.anchors) {
        items.push({
          kind: 'lesson',
          href: `#${a.id}`,
          text: String(a.number),
          tooltip: `Lesson ${a.number}: ${a.title}`,
        })
      }
    }
  }
  return items
}
