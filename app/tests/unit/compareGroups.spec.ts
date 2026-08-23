/**
 * Logical change groups (`src/lib/compareGroups.ts`) — the granularity the compare page diffs,
 * filters and indexes.
 *
 * Two of these cases are INVARIANTS rather than examples, and both exist because the failure they
 * guard is silent:
 *   - TOTALITY: every top-level node of the rendered document lands in exactly one group. A
 *     classification miss must cost a label, never a table.
 *   - UNIQUENESS: keys are unique per document. They become Map keys when the two versions are
 *     paired, so a duplicate would overwrite a group and drop content from the comparison.
 *
 * The last block is a DRIFT GUARD: it splits the output of the real generator → mammoth chain, so a
 * generator or mammoth bump that moves the headers or the table shapes fails here instead of
 * quietly relabelling every area "Area 1" in front of a teacher.
 */
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

import {
  changeSummary,
  groupAnchorId,
  mergeGroupKeys,
  splitDocumentGroups,
} from '@/lib/compareGroups'
import {
  FINAL_EXPLANATION_LABEL,
  LESSON_SEQUENCE_LABEL,
  SUMMARY_TABLE_LABEL,
} from '@/lib/lessonAnchors'
import { renderBundlePreview } from '@/generator/previewBundle'
import { headerRow, paraRow as row, table } from '../helpers/generatorHtml'

/**
 * Top-level nodes that carry content — ELEMENTS **and** non-whitespace text.
 *
 * ⚑ NOT `body.children`. That is elements only, and counting it was how the totality assertion
 * below missed the splitter dropping bare text nodes entirely: the code and its test shared the same
 * blind spot, so the invariant read as proven while being false.
 */
const countTopLevel = (html: string): number =>
  [...new JSDOM(`<body>${html}</body>`).window.document.body.childNodes].filter(
    (n) => n.nodeType === 1 || (n.textContent ?? '').trim() !== '',
  ).length

/** All visible text of a fragment, whitespace-collapsed — what must survive a round trip. */
const textOf = (html: string): string =>
  (new JSDOM(`<body>${html}</body>`).window.document.body.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()

describe('splitDocumentGroups — Lesson Sequence', () => {
  const sequence =
    '<p><strong>DOC TITLE</strong></p><p><em>Subtitle</em></p>' +
    table(headerRow('SUB-STRAND OVERVIEW'), row('Grade Level', 'Grade 10')) +
    table(
      headerRow('LESSON 1 (40 min): Cells'),
      headerRow('A. SPECIFIC LEARNING OUTCOMES'),
      row('Purpose', 'P.'),
    ) +
    table(headerRow('B. LESSON OVERVIEW', 1), row('Overview.')) +
    table(headerRow('C. LESSON IMPLEMENTATION FRAMEWORK', 5), row('a', 'b', 'c', 'd', 'e')) +
    table(headerRow('D. TEACHER REFLECTION', 1), row('TR.')) +
    table(
      headerRow('E. SUMMARY TABLE PROMPT  (pre-filled example for this lesson)'),
      row('O.', 'L.'),
    ) +
    table(
      headerRow('LESSON 2 (40 min): Osmosis'),
      headerRow('A. SPECIFIC LEARNING OUTCOMES'),
      row('Purpose', 'P.'),
    ) +
    table(headerRow('DIFFERENTIATION AND INCLUSION', 3), row('a', 'b', 'c'))

  it('keys and labels every area, carrying the lesson number through A–E', () => {
    const groups = splitDocumentGroups(LESSON_SEQUENCE_LABEL, sequence)
    expect(groups.map((g) => [g.key, g.label, g.lesson])).toEqual([
      ['heading', 'Document heading', null],
      ['overview', 'Sub-strand overview', null],
      ['lesson:1:a', 'Lesson 1 · Specific learning outcomes', 1],
      ['lesson:1:b', 'Lesson 1 · Overview', 1],
      ['lesson:1:c', 'Lesson 1 · Implementation framework', 1],
      ['lesson:1:d', 'Lesson 1 · Teacher reflection', 1],
      ['lesson:1:e', 'Lesson 1 · Summary prompts', 1],
      ['lesson:2:a', 'Lesson 2 · Specific learning outcomes', 2],
      ['differentiation', 'Differentiation and inclusion', null],
    ])
  })

  it('TOTALITY: every top-level node lands in exactly one group', () => {
    const groups = splitDocumentGroups(LESSON_SEQUENCE_LABEL, sequence)
    const assigned = groups.reduce((n, g) => n + countTopLevel(g.html), 0)
    expect(assigned).toBe(countTopLevel(sequence))
    // Both title paragraphs went to the heading group, not just the first.
    expect(countTopLevel(groups[0]!.html)).toBe(2)
    // And the counting cannot be satisfied by the wrong nodes: all the TEXT survives too.
    expect(textOf(groups.map((g) => g.html).join(''))).toBe(textOf(sequence))
  })

  it('TOTALITY: bare text directly under the body survives, before and after a table', () => {
    // ⚑ REGRESSION (found in review 2026-08-23). The splitter walked `body.children` — elements
    // only — so text with no wrapping element vanished with no trace and no failing test. Mammoth
    // wraps everything today, so nothing shipped was affected; this exists because totality is a
    // promise about markup NOBODY HAS SEEN YET, and a promise no test can falsify is not one.
    const groups = splitDocumentGroups(
      LESSON_SEQUENCE_LABEL,
      `LEADING TEXT${table(headerRow('SUB-STRAND OVERVIEW'), row('Grade Level', 'Grade 10'))}TRAILING TEXT`,
    )
    const all = groups.map((g) => g.html).join('')
    expect(all).toContain('LEADING TEXT')
    expect(all).toContain('TRAILING TEXT')
    expect(textOf(all)).toContain('LEADING TEXT')
    expect(textOf(all)).toContain('TRAILING TEXT')
  })

  it('drops whitespace between blocks, which is the only thing it may drop', () => {
    const withGaps = `\n  ${table(headerRow('SUB-STRAND OVERVIEW'))}\n\n  ${table(headerRow('DIFFERENTIATION AND INCLUSION', 3))}\n`
    const groups = splitDocumentGroups(LESSON_SEQUENCE_LABEL, withGaps)
    expect(groups.map((g) => g.key)).toEqual(['overview', 'differentiation'])
    // No stray heading group opened for the leading newline.
    expect(groups[0]!.html.startsWith('<table')).toBe(true)
  })

  it('keeps a whole lesson identifiable: the A group retains the lesson banner', () => {
    const groups = splitDocumentGroups(LESSON_SEQUENCE_LABEL, sequence)
    expect(groups.find((g) => g.key === 'lesson:1:a')!.html).toContain('LESSON 1 (40 min): Cells')
  })

  it('UNIQUENESS: a duplicated area throws rather than overwriting a group', () => {
    const dup =
      table(headerRow('LESSON 1 (40 min): Cells'), headerRow('A. SPECIFIC LEARNING OUTCOMES')) +
      table(headerRow('D. TEACHER REFLECTION', 1), row('one')) +
      table(headerRow('D. TEACHER REFLECTION', 1), row('two'))
    expect(() => splitDocumentGroups(LESSON_SEQUENCE_LABEL, dup)).toThrow(/duplicate group key/)
  })

  it('falls back to a generic label instead of dropping an unrecognized table', () => {
    const groups = splitDocumentGroups(
      LESSON_SEQUENCE_LABEL,
      table(headerRow('SOMETHING UPSTREAM ADDED'), row('a', 'b')),
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('area:1')
    expect(groups[0]!.html).toContain('SOMETHING UPSTREAM ADDED')
  })

  it('an empty document yields no groups', () => {
    expect(splitDocumentGroups(LESSON_SEQUENCE_LABEL, '')).toEqual([])
  })
})

describe('splitDocumentGroups — Final Explanation classifies by position and structure', () => {
  const fe = (...tables: string[]) => '<p><strong>FE</strong></p>' + tables.join('')
  const details = table(
    headerRow('FINAL EXPLANATION: BIOLOGY'),
    headerRow('Student Assessment Document'),
    row('Student Name', '___'),
  )
  const instructions = table(headerRow('INSTRUCTIONS FOR STUDENTS'), row('Do the thing.'))
  const section = (title: string) => table(headerRow(title), row('prompt', 'exemplar'))
  const rubric = table(headerRow('RUBRIC', 4), row('C', '4', '3', '2'))

  it('labels heading, details, instructions, ordinal sections and the rubric', () => {
    const groups = splitDocumentGroups(
      FINAL_EXPLANATION_LABEL,
      fe(details, instructions, section('Part One'), section('Part Two'), rubric),
    )
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ['fe:heading', 'Final explanation · Heading'],
      ['fe:details', 'Final explanation · Student details'],
      ['fe:instructions', 'Final explanation · Instructions'],
      ['fe:section:1', 'Final explanation · Section 1'],
      ['fe:section:2', 'Final explanation · Section 2'],
      ['fe:rubric', 'Final explanation · Rubric'],
    ])
  })

  it('an authored section TITLED "RUBRIC" is still a section — structure decides, not text', () => {
    const groups = splitDocumentGroups(
      FINAL_EXPLANATION_LABEL,
      fe(details, section('RUBRIC'), rubric),
    )
    expect(groups.map((g) => g.key)).toEqual([
      'fe:heading',
      'fe:details',
      'fe:section:1',
      'fe:rubric',
    ])
  })

  it('an authored section TITLED "INSTRUCTIONS FOR STUDENTS" is still a section', () => {
    const groups = splitDocumentGroups(
      FINAL_EXPLANATION_LABEL,
      fe(details, section('INSTRUCTIONS FOR STUDENTS')),
    )
    expect(groups.map((g) => g.key)).toEqual(['fe:heading', 'fe:details', 'fe:section:1'])
  })

  it('optional instructions and rubric may both be absent', () => {
    const groups = splitDocumentGroups(FINAL_EXPLANATION_LABEL, fe(details, section('Only')))
    expect(groups.map((g) => g.key)).toEqual(['fe:heading', 'fe:details', 'fe:section:1'])
  })

  it('ORDINAL PAIRING, documented consequence: inserting a section shifts every later one', () => {
    const before = splitDocumentGroups(
      FINAL_EXPLANATION_LABEL,
      fe(details, section('A'), section('B')),
    )
    const after = splitDocumentGroups(
      FINAL_EXPLANATION_LABEL,
      fe(details, section('NEW'), section('A'), section('B')),
    )
    // `fe:section:1` is "A" before and "NEW" after, so sections 1..n all read as changed. Accepted
    // for Phase 1: deterministic and safe, where matching authored titles is neither.
    expect(before.find((g) => g.key === 'fe:section:1')!.html).toContain('A')
    expect(after.find((g) => g.key === 'fe:section:1')!.html).toContain('NEW')
  })
})

describe('splitDocumentGroups — Summary Table', () => {
  it('separates heading, sub-strand details, instructions and the lesson rows', () => {
    const html =
      '<p><strong>SUMMARY TABLE: BIOLOGY GRADE 10</strong></p>' +
      table(headerRow('SUMMARY TABLE: BIOLOGY GRADE 10'), row('Sub-Strand', 'SS')) +
      table(headerRow('INSTRUCTIONS'), row('FOR TEACHERS: …')) +
      table(row('Lesson # and Title', 'observed', 'learned', 'explained'), row('L1', 'o', 'l', 'e'))

    expect(splitDocumentGroups(SUMMARY_TABLE_LABEL, html).map((g) => [g.key, g.label])).toEqual([
      ['st:heading', 'Summary table · Heading'],
      ['st:header', 'Summary table · Sub-strand details'],
      ['st:instructions', 'Summary table · Instructions'],
      ['st:responses', 'Summary table · Lesson responses'],
    ])
  })
})

describe('groupAnchorId', () => {
  it('slugs document AND key into a stable element id', () => {
    expect(groupAnchorId(LESSON_SEQUENCE_LABEL, 'lesson:3:c')).toBe(
      'cmp-lesson-sequence-lesson-3-c',
    )
    expect(groupAnchorId(FINAL_EXPLANATION_LABEL, 'fe:section:2')).toBe(
      'cmp-final-explanation-fe-section-2',
    )
  })

  it('cannot collide across documents even when two documents share a key', () => {
    // The splitter only promises uniqueness WITHIN a document. Cross-document uniqueness is today an
    // accident of the `fe:`/`st:` prefixes — the Lesson Sequence's keys carry none — so the id must
    // not depend on it. Two identical keys in different documents must still yield different ids.
    expect(groupAnchorId(LESSON_SEQUENCE_LABEL, 'heading')).not.toBe(
      groupAnchorId(SUMMARY_TABLE_LABEL, 'heading'),
    )
  })
})

describe('changeSummary', () => {
  it('states the two counts separately rather than implying containment', () => {
    // ⚑ THE BUG THIS REPLACES: "2 changed areas in 1 lesson" claimed the Final Explanation's rubric
    // change sat inside that lesson. It belongs to no lesson at all.
    const groups = [
      { changed: true, lesson: 3 },
      { changed: true, lesson: null },
      { changed: false, lesson: 1 },
    ]
    expect(changeSummary(groups)).toBe('2 changed areas · 1 lesson affected')
  })

  it('omits the lesson count when no lesson area changed', () => {
    expect(changeSummary([{ changed: true, lesson: null }])).toBe('1 changed area')
  })

  it('counts each lesson once however many of its areas changed, and pluralizes', () => {
    const groups = [
      { changed: true, lesson: 1 },
      { changed: true, lesson: 1 },
      { changed: true, lesson: 2 },
    ]
    expect(changeSummary(groups)).toBe('3 changed areas · 2 lessons affected')
  })

  it('is empty when nothing changed — the page shows its own identical message', () => {
    expect(changeSummary([{ changed: false, lesson: 1 }])).toBe('')
  })
})

describe('mergeGroupKeys — one document order across both versions', () => {
  it('keeps a removed area in place rather than appending it at the end', () => {
    expect(mergeGroupKeys(['a', 'gone', 'b'], ['a', 'b'])).toEqual(['a', 'gone', 'b'])
  })

  it('keeps an inserted area in "to" position', () => {
    expect(mergeGroupKeys(['a', 'b'], ['a', 'new', 'b'])).toEqual(['a', 'new', 'b'])
  })

  it('is the identity for identical key sequences', () => {
    expect(mergeGroupKeys(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('handles a wholly added and a wholly removed document side', () => {
    expect(mergeGroupKeys([], ['a', 'b'])).toEqual(['a', 'b'])
    expect(mergeGroupKeys(['a', 'b'], [])).toEqual(['a', 'b'])
  })

  it('never drops or duplicates a key, even when the areas are reordered', () => {
    const merged = mergeGroupKeys(['a', 'b', 'c'], ['c', 'b', 'a'])
    expect([...new Set(merged)]).toEqual(merged)
    expect(new Set(merged)).toEqual(new Set(['a', 'b', 'c']))
  })
})

describe('drift guard: the real generator → mammoth chain still classifies cleanly', () => {
  it('splits all three documents into the expected keys, with nothing unclassified', async () => {
    const lesson = (number: number, title: string) => ({
      number,
      title,
      duration: '40 min',
      slo: { purpose: 'P.', knowledge: 'K.', skills: 'S.', attitudes: 'A.', keyInquiry: 'Q?' },
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
      title: 'T',
      meta: {
        subject: 'Biology',
        grade: 10,
        substrand_id: '1.1',
        substrand_name: 'Probe',
        titleDoc: 'PROBE DOC',
        subtitleDoc: 'Sub title',
      },
      unit: {
        gradeLevel: 'Grade 10',
        subject: 'Biology',
        strand: 'S',
        substrand: 'SS',
        overview: 'U.',
      },
      lessons: [lesson(1, 'Cells'), lesson(2, 'Osmosis')],
      finalExplanation: {
        subjectLabel: 'Biology',
        instructions: 'Do the thing.',
        sections: [
          { title: 'Part One', prompt: 'P1', exemplar: 'E1' },
          { title: 'Part Two', prompt: 'P2', exemplar: 'E2' },
        ],
        rubric: [{ criterion: 'C', excellent: '4', proficient: '3', developing: '2' }],
      },
      summaryTable: {
        subStrand: 'SS',
        drivingQuestion: 'DQ?',
        lessons: [{ number: 1, title: 'Cells', observed: 'o', learned: 'l', explained: 'e' }],
      },
    } as never

    const sections = await renderBundlePreview(bundle)
    const keysFor = (label: string) =>
      splitDocumentGroups(label, sections.find((s) => s.label === label)!.html).map((g) => g.key)

    expect(keysFor(LESSON_SEQUENCE_LABEL)).toEqual([
      'heading',
      'overview',
      'lesson:1:a',
      'lesson:1:b',
      'lesson:1:c',
      'lesson:1:d',
      'lesson:1:e',
      'lesson:2:a',
      'lesson:2:b',
      'lesson:2:c',
      'lesson:2:d',
      'lesson:2:e',
      'differentiation',
    ])
    expect(keysFor(FINAL_EXPLANATION_LABEL)).toEqual([
      'fe:heading',
      'fe:details',
      'fe:instructions',
      'fe:section:1',
      'fe:section:2',
      'fe:rubric',
    ])
    expect(keysFor(SUMMARY_TABLE_LABEL)).toEqual([
      'st:heading',
      'st:header',
      'st:instructions',
      'st:responses',
    ])

    // TOTALITY against real output, not just the hand-built fixtures.
    for (const s of sections) {
      const groups = splitDocumentGroups(s.label, s.html)
      const assigned = groups.reduce((n, g) => n + countTopLevel(g.html), 0)
      expect(assigned).toBe(countTopLevel(s.html))
      expect(groups.some((g) => /area:\d+$/.test(g.key))).toBe(false)
    }
  })
})
