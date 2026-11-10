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

/**
 * The one slug transform behind every in-page anchor id. Shared because the compare page emits BOTH
 * schemes into the same document — `docSectionId` for its document sections and
 * `compareGroups.groupAnchorId` for its area rows — so two copies of this regex chain could drift
 * apart on a character-class change and start colliding.
 */
export const slugId = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Stable section-container id for a rendered document section label ("Lesson Sequence" → `doc-lesson-sequence`). */
export const docSectionId = (label: string): string => `doc-${slugId(label)}`

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

/**
 * The three rendered-document labels `docxToSections` emits, in document order. Named here — beside
 * the anchor helpers that consume them — so `previewBundle.ts` produces them and `compareGroups.ts`
 * branches on them through ONE definition: a rename that only reached one side would silently push
 * every area of two documents onto the splitter's generic fallback labels.
 */
export const LESSON_SEQUENCE_LABEL = 'Lesson Sequence'
export const FINAL_EXPLANATION_LABEL = 'Final Explanation'
export const SUMMARY_TABLE_LABEL = 'Summary Table'

export interface AnnotatedSection {
  label: string
  html: string
  anchors: LessonAnchor[]
}

/**
 * Annotate a rendered version's sections for the jump nav: only the Lesson Sequence can carry
 * lesson headers, so only it is scanned — the other documents pass through with no anchors.
 */
export function annotateSections(sections: { label: string; html: string }[]): AnnotatedSection[] {
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
export function docNavItems(sections: Pick<AnnotatedSection, 'label' | 'anchors'>[]): DocNavItem[] {
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

/** One collapsible block on the lesson page: an id to link to, a title, and its DOCX-derived HTML. */
export interface ReadingDisclosure {
  id: string
  title: string
  html: string
  /** Set for a lesson block: the edit handoff remembers the lesson a reader opened (`#lesson-n`). */
  lessonNumber?: number
}

/**
 * Split the Lesson Sequence HTML at lesson boundaries (interface refinement 2026-11-10, step 5;
 * `docs/DESIGN-read-page-accordion-2026-08-29.md` §4). A lesson begins at the TOP-LEVEL table whose
 * first row is its `LESSON n (…): title` header, so the split happens at that table's `<table`, never
 * inside it. Everything before the first lesson is the overview.
 *
 * ⚑ NOTHING IS ADDED OR LOST: the chunks concatenate back to the input exactly (pinned by
 * `lessonAnchors.spec.ts`). This frames the generated document; it is not a second renderer. The same
 * header pattern and the same keep-the-first rule for duplicate numbers as {@link annotateLessonAnchors},
 * so the jump nav and the blocks agree. Two headers inside one table (malformed) cannot be split
 * apart, so the second stays inside the first's block and gets no block or nav chip of its own.
 */
export function partitionLessonSequence(html: string): {
  overview: string
  lessons: { anchor: LessonAnchor; html: string }[]
} {
  // Outermost open <table> at each position, by walking the table tags once.
  const tableTags = [...html.matchAll(/<table\b|<\/table>/g)]
  const outermostTableStartAt = (index: number): number => {
    let depth = 0
    let start = index
    for (const t of tableTags) {
      if ((t.index ?? 0) >= index) break
      if (t[0] === '</table>') depth = Math.max(0, depth - 1)
      else {
        if (depth === 0) start = t.index ?? index
        depth++
      }
    }
    return depth > 0 ? start : index
  }

  const cuts: { at: number; anchor: LessonAnchor }[] = []
  const seen = new Set<number>()
  for (const m of html.matchAll(LESSON_HEADER)) {
    const number = Number(m[1])
    if (seen.has(number)) continue
    seen.add(number)
    const at = outermostTableStartAt(m.index ?? 0)
    if (cuts.length > 0 && at <= cuts[cuts.length - 1].at) continue
    cuts.push({ at, anchor: { id: `lesson-${number}`, number, title: decodeEntities(m[3]) } })
  }

  return {
    overview: html.slice(0, cuts[0]?.at ?? html.length),
    lessons: cuts.map((c, i) => ({
      anchor: c.anchor,
      html: html.slice(c.at, cuts[i + 1]?.at ?? html.length),
    })),
  }
}

/**
 * The lesson page's collapsible blocks, in document order: Overview, Lesson 1…n, then the other
 * documents, plus the matching jump-nav model. A per-request transform on the cached HTML, used ONLY
 * by the lesson page: Quick preview and Compare keep `annotateSections` and their own layouts.
 */
export function readingDisclosures(sections: { label: string; html: string }[]): {
  disclosures: ReadingDisclosure[]
  nav: DocNavItem[]
} {
  const disclosures: ReadingDisclosure[] = []
  const navSections: Pick<AnnotatedSection, 'label' | 'anchors'>[] = []
  for (const s of sections) {
    if (s.label !== LESSON_SEQUENCE_LABEL) {
      disclosures.push({ id: docSectionId(s.label), title: sentenceCase(s.label), html: s.html })
      navSections.push({ label: s.label, anchors: [] })
      continue
    }
    const { overview, lessons } = partitionLessonSequence(s.html)
    // Always present, so the nav's Overview link has a target. Generated plans always open with the
    // sub-strand overview table; with no lesson headers at all the whole document lands here.
    // Titled "Unit overview" to match the agreed preview (operator decision 2026-11-10); its jump
    // link stays the shorter "Overview".
    disclosures.push({ id: docSectionId(s.label), title: 'Unit overview', html: overview })
    for (const l of lessons)
      disclosures.push({
        id: l.anchor.id,
        title: l.anchor.title
          ? `Lesson ${l.anchor.number} · ${l.anchor.title}`
          : `Lesson ${l.anchor.number}`,
        html: l.html,
        lessonNumber: l.anchor.number,
      })
    navSections.push({ label: s.label, anchors: lessons.map((l) => l.anchor) })
  }
  // Sentence case on this page only ("Final explanation"), as in the agreed preview; the shared
  // `docNavItems` keeps the generator's labels for Quick preview.
  const nav = docNavItems(navSections).map((item) =>
    item.kind === 'section' ? { ...item, text: sentenceCase(item.text) } : item,
  )
  return { disclosures, nav }
}

/** "Final Explanation" → "Final explanation". The labels are fixed English, so this is safe. */
function sentenceCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase()
}
