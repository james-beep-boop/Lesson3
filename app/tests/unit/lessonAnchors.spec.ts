/**
 * In-page lesson anchors (design critique 2026-07-12): the pure transform, and a drift guard that
 * runs the REAL generator → mammoth chain — if a generator or mammoth bump changes the lesson
 * header markup, the jump nav would silently vanish; this spec fails instead.
 */
import { describe, expect, it } from 'vitest'

import { annotateLessonAnchors, docSectionId } from '@/lib/lessonAnchors'
import { renderBundlePreview } from '@/generator/previewBundle'

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
    const html = '<table><tbody><tr><td><p><strong>B. LESSON OVERVIEW</strong></p></td></tr></tbody></table>'
    expect(annotateLessonAnchors(html)).toEqual({ html, anchors: [] })
    // The generator's other LESSON-word headers must not match either.
    expect(annotateLessonAnchors('<p><strong>LESSON undefined (x): y</strong></p>').anchors).toEqual([])
  })

  it('docSectionId slugs the section labels stably', () => {
    expect(docSectionId('Lesson Sequence')).toBe('doc-lesson-sequence')
    expect(docSectionId('Final Explanation')).toBe('doc-final-explanation')
    expect(docSectionId('Summary Table')).toBe('doc-summary-table')
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
  })
})
