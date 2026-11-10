/**
 * In-page lesson anchors (design critique 2026-07-12): the pure transform, and a drift guard that
 * runs the REAL generator → mammoth chain — if a generator or mammoth bump changes the lesson
 * header markup, the jump nav would silently vanish; this spec fails instead.
 */
import { describe, expect, it } from 'vitest'

import {
  annotateLessonAnchors,
  annotateSections,
  docNavItems,
  docSectionId,
  partitionLessonSequence,
  readingDisclosures,
} from '@/lib/lessonAnchors'
import { renderBundlePreview } from '@/generator/previewBundle'
import { STORED_NULL_LINKS } from '../helpers/nullResourceLinks'

/** The exact shape mammoth emits for the generator's `fullHeader` lesson row (probed 2026-07-12). */
const header = (n: string, title: string) =>
  `<table><tbody><tr><td colspan="2"><p><strong>LESSON ${n} (40 min): ${title}</strong></p></td></tr></tbody></table>`

describe('annotateLessonAnchors', () => {
  it('injects ids and reports anchors in document order, decoding entities in titles', () => {
    const html = `<p><strong>Doc title</strong></p>${header('1', 'Cells &amp; Transport')}${header('2', 'Osmosis')}`
    const { html: out, anchors } = annotateLessonAnchors(html)

    expect(anchors).toEqual([
      { id: 'lesson-1', number: 1, title: 'Cells & Transport' },
      { id: 'lesson-2', number: 2, title: 'Osmosis' },
    ])
    expect(out).toContain('<p id="lesson-1"><strong>LESSON 1')
    expect(out).toContain('<p id="lesson-2"><strong>LESSON 2')
    // Nothing else moved: stripping the injected ids restores the input byte-for-byte.
    expect(out.replace(/ id="lesson-\d+"/g, '')).toBe(html)
  })

  it('keeps only the first occurrence of a duplicated lesson number (ids stay unique)', () => {
    const { html: out, anchors } = annotateLessonAnchors(header('3', 'One') + header('3', 'Two'))
    expect(anchors).toEqual([{ id: 'lesson-3', number: 3, title: 'One' }])
    expect(out.match(/id="lesson-3"/g)).toHaveLength(1)
  })

  it('passes non-matching HTML through unchanged', () => {
    const html =
      '<table><tbody><tr><td><p><strong>B. LESSON OVERVIEW</strong></p></td></tr></tbody></table>'
    expect(annotateLessonAnchors(html)).toEqual({ html, anchors: [] })
    // The generator's other LESSON-word headers must not match either.
    expect(
      annotateLessonAnchors('<p><strong>LESSON undefined (x): y</strong></p>').anchors,
    ).toEqual([])
  })

  it('docSectionId slugs the section labels stably', () => {
    expect(docSectionId('Lesson Sequence')).toBe('doc-lesson-sequence')
    expect(docSectionId('Final Explanation')).toBe('doc-final-explanation')
    expect(docSectionId('Summary Table')).toBe('doc-summary-table')
  })
})

describe('docNavItems — the one cross-surface jump-nav model (lesson page + preview page)', () => {
  it('renames the Lesson Sequence link to Overview and chips its lessons after a label', () => {
    const sections = annotateSections([
      { label: 'Lesson Sequence', html: header('1', 'Cells') + header('2', 'Osmosis') },
      { label: 'Summary Table', html: '<table></table>' },
    ])
    expect(docNavItems(sections)).toEqual([
      { kind: 'section', href: '#doc-lesson-sequence', text: 'Overview' },
      { kind: 'lessons-label', text: 'Lessons' },
      { kind: 'lesson', href: '#lesson-1', text: '1', tooltip: 'Lesson 1: Cells' },
      { kind: 'lesson', href: '#lesson-2', text: '2', tooltip: 'Lesson 2: Osmosis' },
      { kind: 'section', href: '#doc-summary-table', text: 'Summary Table' },
    ])
  })

  it('omits the Lessons label and chips when no anchors matched, and only scans the sequence', () => {
    // A LESSON-shaped header in a NON-sequence section must not be scanned or linked.
    const sections = annotateSections([
      { label: 'Lesson Sequence', html: '<p>no headers here</p>' },
      { label: 'Final Explanation', html: header('9', 'Should not match') },
    ])
    expect(sections[1]!.html).not.toContain('id="lesson-9"')
    expect(docNavItems(sections)).toEqual([
      { kind: 'section', href: '#doc-lesson-sequence', text: 'Overview' },
      { kind: 'section', href: '#doc-final-explanation', text: 'Final Explanation' },
    ])
  })
})

describe('drift guard: real generator → mammoth output still carries matchable lesson headers', () => {
  it('finds every lesson in a real rendered Lesson Sequence', async () => {
    const lesson = (number: number, title: string) => ({
      number,
      title,
      duration: '40 min',
      slo: {
        purpose: 'P.',
        knowledge: 'K.',
        skills: 'S.',
        attitudes: 'A.',
        keyInquiry: 'Q?',
      },
      overview: 'Overview text.',
      framework: [
        {
          phase: 'Predict Phase',
          learnerExperience: 'LE.',
          teacherMoves: 'TM.',
          sensemakingStrategy: 'SS.',
          formativeAssessment: 'FA.',
        },
      ],
      teacherReflection: 'TR.',
      summaryTablePrompt: { observed: 'O.', learned: 'L.', explained: 'E.' },
      resourceLinks: STORED_NULL_LINKS,
    })
    const bundle = {
      id: 1,
      title: 'BIOLOGY GRADE 10: ANCHOR PROBE',
      meta: {
        subject: 'Biology',
        grade: 10,
        substrand_id: '1.1',
        substrand_name: 'Anchor Probe',
        titleDoc: 'Anchor Probe Lesson Sequence',
        col3Label: 'Sensemaking',
        col5Label: 'Resources',
      },
      unit: { overview: 'Unit overview.' },
      lessons: [lesson(1, "Cells & 'Transport'"), lesson(2, 'Osmosis')],
      finalExplanation: {},
      summaryTable: {},
    } as never

    const sections = await renderBundlePreview(bundle)
    const sequence = sections.find((s) => s.label === 'Lesson Sequence')
    expect(sequence).toBeDefined()

    const { anchors } = annotateLessonAnchors(sequence!.html)
    expect(anchors.map((a) => a.number)).toEqual([1, 2])
    // Titles survive the escape → decode round-trip.
    expect(anchors[0]!.title).toBe("Cells & 'Transport'")

    // The lesson page's blocks split the REAL document at top-level tables and lose nothing.
    const { overview, lessons } = partitionLessonSequence(sequence!.html)
    expect(lessons.map((l) => l.anchor.number)).toEqual([1, 2])
    expect(overview + lessons.map((l) => l.html).join('')).toBe(sequence!.html)
    for (const l of lessons) {
      expect(l.html.startsWith('<table')).toBe(true)
      expect(l.html.match(/<table\b/g)?.length).toBe(l.html.match(/<\/table>/g)?.length)
    }
    expect(lessons[0]!.html).toContain('LESSON 1 (40 min)')
    expect(lessons[0]!.html).not.toContain('LESSON 2 (40 min)')
  })
})

describe('partitionLessonSequence and readingDisclosures — the lesson page blocks', () => {
  const nested = (n: string, title: string) =>
    `<table><tbody><tr><td><p><strong>LESSON ${n} (40 min): ${title}</strong></p><table><tbody><tr><td>inner</td></tr></tbody></table></td></tr></tbody></table><table><tbody><tr><td>body ${n}</td></tr></tbody></table>`

  it('splits at the outermost table of each header and reassembles the input exactly', () => {
    const html = `<p>Doc</p><table><tbody><tr><td>overview</td></tr></tbody></table>${nested('1', 'A')}${nested('2', 'B &amp; C')}`
    const { overview, lessons } = partitionLessonSequence(html)
    expect(overview).toBe('<p>Doc</p><table><tbody><tr><td>overview</td></tr></tbody></table>')
    expect(lessons.map((l) => l.anchor)).toEqual([
      { id: 'lesson-1', number: 1, title: 'A' },
      { id: 'lesson-2', number: 2, title: 'B & C' },
    ])
    expect(lessons[0]!.html).toContain('body 1')
    expect(lessons[0]!.html).not.toContain('LESSON 2')
    expect(overview + lessons.map((l) => l.html).join('')).toBe(html)
  })

  it('handles zero lessons, duplicate numbers and two headers in one table without losing HTML', () => {
    const none = '<p>No lessons here</p>'
    expect(partitionLessonSequence(none)).toEqual({ overview: none, lessons: [] })

    const dup = header('3', 'One') + header('3', 'Two')
    const d = partitionLessonSequence(dup)
    expect(d.lessons.map((l) => l.anchor.number)).toEqual([3])
    expect(d.overview + d.lessons[0]!.html).toBe(dup)

    const shared = `<table><tbody><tr><td><p><strong>LESSON 1 (40 min): A</strong></p></td></tr><tr><td><p><strong>LESSON 2 (40 min): B</strong></p></td></tr></tbody></table>`
    const sh = partitionLessonSequence(shared)
    expect(sh.lessons.map((l) => l.anchor.number)).toEqual([1])
    expect(sh.overview + sh.lessons[0]!.html).toBe(shared)
  })

  it('builds Overview, Lesson n · title, then the other documents, with a nav that matches the ids', () => {
    const { disclosures, nav } = readingDisclosures([
      { label: 'Lesson Sequence', html: `<p>Doc</p>${header('1', 'Cells')}${header('2', '')}` },
      { label: 'Final Explanation', html: '<p>FE</p>' },
      { label: 'Summary Table', html: '<p>ST</p>' },
    ])
    expect(disclosures.map((d) => [d.id, d.title, d.lessonNumber])).toEqual([
      ['doc-lesson-sequence', 'Overview', undefined],
      ['lesson-1', 'Lesson 1 · Cells', 1],
      ['lesson-2', 'Lesson 2', 2],
      ['doc-final-explanation', 'Final Explanation', undefined],
      ['doc-summary-table', 'Summary Table', undefined],
    ])
    const ids = new Set(disclosures.map((d) => d.id))
    for (const item of nav) if ('href' in item) expect(ids.has(item.href.slice(1))).toBe(true)
    // The blocks carry the raw HTML: no injected ids to duplicate the block ids.
    expect(disclosures.some((d) => d.html.includes('id="lesson-'))).toBe(false)
  })
})
