/**
 * `diffVersionGroupsCached` BEHAVIOUR — what the compare page is actually told about two versions.
 * (`htmlDiffCacheWiring.spec.ts` covers the cache mechanics; this file covers the answer.)
 *
 * Every case here is a real editing shape, and three of them exist because the obvious
 * implementation gets them wrong:
 *
 *  - HtmlDiff's annotations are ASYMMETRIC (probed 2026-08-23, Payload 3.87.1): an insertion is
 *    marked only in the new pane, a deletion only in the old. Anything that filtered or aligned the
 *    two panes independently would slide unrelated content side by side.
 *  - A paragraph split/merge, and a whitespace-only edit, produce NO annotations in EITHER pane. So
 *    `changed` must come from comparing the source HTML; counting annotations would report a
 *    genuinely edited version as identical. `structureOnly` marks these so the page can say why a
 *    changed area shows no highlighting.
 *  - Whole areas added or removed must keep their position in the document, not pile up at the end.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getArtifact, putArtifact, renderVersionSectionsCached } = vi.hoisted(() => ({
  getArtifact: vi.fn(),
  putArtifact: vi.fn(),
  renderVersionSectionsCached: vi.fn(),
}))

vi.mock('../../src/generator/artifactCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/generator/artifactCache')>(
    '../../src/generator/artifactCache',
  )
  return { ...actual, getArtifact, putArtifact }
})
vi.mock('../../src/generator/htmlSectionsCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/generator/htmlSectionsCache')>(
    '../../src/generator/htmlSectionsCache',
  )
  return { ...actual, renderVersionSectionsCached }
})

import { diffVersionGroupsCached, type CompareGroup } from '../../src/generator/htmlDiffCache'
import { cellRow, headerRow, table } from '../helpers/generatorHtml'

const payload = { logger: { warn: vi.fn() } } as never

interface LessonText {
  title?: string
  framework?: string
  reflection?: string
}

const lessonTables = (
  n: number,
  {
    title = 'Cells',
    framework = '<p>Teacher greets the class.</p>',
    reflection = '<p>TR.</p>',
  }: LessonText = {},
) =>
  table(
    headerRow(`LESSON ${n} (40 min): ${title}`),
    headerRow('A. SPECIFIC LEARNING OUTCOMES'),
    cellRow('<p>Purpose</p>', '<p>P.</p>'),
  ) +
  table(headerRow('B. LESSON OVERVIEW', 1), cellRow('<p>Overview.</p>')) +
  table(
    headerRow('C. LESSON IMPLEMENTATION FRAMEWORK', 5),
    cellRow('<p>a</p>', '<p>b</p>', framework, '<p>d</p>', '<p>e</p>'),
  ) +
  table(headerRow('D. TEACHER REFLECTION', 1), cellRow(reflection)) +
  table(
    headerRow('E. SUMMARY TABLE PROMPT  (pre-filled example for this lesson)'),
    cellRow('<p>O.</p>', '<p>L.</p>'),
  )

const sequence = (...lessons: string[]) =>
  '<p><strong>DOC TITLE</strong></p><p><em>Subtitle</em></p>' +
  table(headerRow('SUB-STRAND OVERVIEW'), cellRow('<p>Grade Level</p>', '<p>Grade 10</p>')) +
  lessons.join('') +
  table(headerRow('DIFFERENTIATION AND INCLUSION', 3), cellRow('<p>a</p>', '<p>b</p>', '<p>c</p>'))

/** Diff two Lesson Sequence bodies as versions 1 → 2. */
const diff = async (fromHtml: string, toHtml: string): Promise<CompareGroup[]> => {
  renderVersionSectionsCached.mockImplementation(async (_p: unknown, id: number | string) => [
    { label: 'Lesson Sequence', html: String(id) === '1' ? fromHtml : toHtml },
  ])
  return diffVersionGroupsCached(payload, 1, 2)
}

const byKey = (groups: CompareGroup[], key: string): CompareGroup =>
  groups.find((g) => g.key === key)!

/**
 * The changed arm of the `CompareGroup` union, narrowed. Only a changed area has a diffed pane
 * pair, a `presence` and a `structureOnly` verdict — an unchanged one carries a single `html` — so
 * asserting on those fields means asserting the area changed at all, and this says so in one place.
 */
const changedGroup = (groups: CompareGroup[], key: string) => {
  const g = byKey(groups, key)
  if (!g.changed) throw new Error(`expected "${key}" to be a changed area, but it was unchanged`)
  return g
}
const changedKeys = (groups: CompareGroup[]) => groups.filter((g) => g.changed).map((g) => g.key)

beforeEach(() => {
  vi.clearAllMocks()
  getArtifact.mockResolvedValue(null) // always a miss: we are testing the computation
  putArtifact.mockResolvedValue(undefined)
})

describe('identical versions', () => {
  it('reports no changed areas at all', async () => {
    const html = sequence(lessonTables(1))
    const groups = await diff(html, html)

    expect(groups.length).toBeGreaterThan(0)
    expect(changedKeys(groups)).toEqual([])
    // Every area lands on the unchanged arm, which stores ONE html rather than a diffed pair.
    expect(groups.every((g) => !g.changed)).toBe(true)
  })
})

describe('a prose edit inside one area', () => {
  it('marks ONLY that area, leaving every other area untouched', async () => {
    const groups = await diff(
      sequence(lessonTables(1), lessonTables(2)),
      sequence(
        lessonTables(1, { framework: '<p>Teacher greets the class politely.</p>' }),
        lessonTables(2),
      ),
    )
    expect(changedKeys(groups)).toEqual(['lesson:1:c'])
  })

  it('a replacement annotates BOTH panes (red left, green right)', async () => {
    const groups = await diff(
      sequence(lessonTables(1, { framework: '<p>small</p>' })),
      sequence(lessonTables(1, { framework: '<p>huge</p>' })),
    )
    const c = changedGroup(groups, 'lesson:1:c')
    expect(c.presence).toBe('both')
    expect(c.structureOnly).toBe(false)
    expect(c.oldHtml).toContain('data-match-type="delete"')
    expect(c.newHtml).toContain('data-match-type="create"')
  })

  it('an INSERTION annotates the new pane only — the old pane has nothing to mark', async () => {
    const groups = await diff(
      sequence(lessonTables(1, { reflection: '<p>A</p>' })),
      sequence(lessonTables(1, { reflection: '<p>A B</p>' })),
    )
    const d = changedGroup(groups, 'lesson:1:d')
    expect(d.newHtml).toContain('data-match-type="create"')
    expect(d.oldHtml).not.toContain('data-match-type')
  })

  it('a DELETION annotates the old pane only — which is why panes are paired, not filtered apart', async () => {
    const groups = await diff(
      sequence(lessonTables(1, { reflection: '<p>A B</p>' })),
      sequence(lessonTables(1, { reflection: '<p>A</p>' })),
    )
    const d = changedGroup(groups, 'lesson:1:d')
    expect(d.oldHtml).toContain('data-match-type="delete"')
    expect(d.newHtml).not.toContain('data-match-type')
  })
})

describe('changes the engine cannot annotate', () => {
  it('a paragraph SPLIT is still reported as changed, and flagged structure-only', async () => {
    const groups = await diff(
      sequence(lessonTables(1, { reflection: '<p>A B</p>' })),
      sequence(lessonTables(1, { reflection: '<p>A</p><p>B</p>' })),
    )
    const d = changedGroup(groups, 'lesson:1:d')
    // ⚑ The exact case that makes annotation-counting wrong: HtmlDiff emits NOTHING here.
    expect(d.oldHtml).not.toContain('data-match-type')
    expect(d.newHtml).not.toContain('data-match-type')
    expect(d.structureOnly).toBe(true)
  })

  it('a whitespace-only edit is reported the same way, not as identical', async () => {
    const groups = await diff(
      sequence(lessonTables(1, { reflection: '<p>A  B</p>' })),
      sequence(lessonTables(1, { reflection: '<p>A B</p>' })),
    )
    expect(changedGroup(groups, 'lesson:1:d').structureOnly).toBe(true)
  })
})

describe('a changed lesson title', () => {
  it('marks the lesson’s A area and keeps the key stable (the number did not move)', async () => {
    const groups = await diff(
      sequence(lessonTables(1, { title: 'Cells' })),
      sequence(lessonTables(1, { title: 'Osmosis' })),
    )
    expect(changedKeys(groups)).toEqual(['lesson:1:a'])
    expect(changedGroup(groups, 'lesson:1:a').newHtml).toContain('data-match-type="create"')
  })
})

describe('whole lessons added and removed', () => {
  it('an ADDED lesson appears as five changed areas with an empty "from" side', async () => {
    const groups = await diff(sequence(lessonTables(1)), sequence(lessonTables(1), lessonTables(2)))

    expect(changedKeys(groups)).toEqual([
      'lesson:2:a',
      'lesson:2:b',
      'lesson:2:c',
      'lesson:2:d',
      'lesson:2:e',
    ])
    const a = changedGroup(groups, 'lesson:2:a')
    expect(a.presence, 'the area exists only in the "to" version').toBe('to-only')
    expect(a.newHtml).toContain('data-match-type="create"')
  })

  it('a REMOVED lesson keeps its place in the document instead of being appended at the end', async () => {
    const groups = await diff(sequence(lessonTables(1), lessonTables(2)), sequence(lessonTables(1)))

    expect(changedGroup(groups, 'lesson:2:a').presence).toBe('from-only')
    expect(changedGroup(groups, 'lesson:2:a').oldHtml).toContain('data-match-type="delete"')
    // Ordering is the point: the removed lesson sits after lesson 1 and before differentiation.
    const order = groups.map((g) => g.key)
    expect(order.indexOf('lesson:2:a')).toBeGreaterThan(order.indexOf('lesson:1:e'))
    expect(order.indexOf('lesson:2:a')).toBeLessThan(order.indexOf('differentiation'))
  })
})

describe('PHASE 1 LIMITATION: ordinal keys cascade on a MIDDLE insertion', () => {
  // The tests above add and remove at the END, which is exact. Inserting in the middle renumbers
  // every later lesson, so `lesson:N:*` pairs each area against its NEIGHBOUR's content and the
  // whole tail reads as changed. Documented in compareGroups.ts and accepted for Phase 1: it is
  // deterministic and loses nothing, where matching on authored text could pair two genuinely
  // different lessons. This test exists so the limitation is visible rather than discovered — if a
  // stable per-lesson identity ever lands, this expectation SHOULD change.
  it('renumbering makes every later lesson compare against its neighbour', async () => {
    const groups = await diff(
      sequence(lessonTables(1, { title: 'First' }), lessonTables(2, { title: 'Second' })),
      // "Inserted" takes number 2; the old lesson 2 is renumbered to 3.
      sequence(
        lessonTables(1, { title: 'First' }),
        lessonTables(2, { title: 'Inserted' }),
        lessonTables(3, { title: 'Second' }),
      ),
    )
    // Lesson 1 is untouched and correctly reports so — the cascade starts at the insertion point.
    expect(changedKeys(groups).some((k) => k.startsWith('lesson:1:'))).toBe(false)
    // Lesson 2's areas now compare "Second" against "Inserted" rather than matching them up.
    const shifted = changedGroup(groups, 'lesson:2:a')
    expect(shifted.presence).toBe('both')
    expect(shifted.oldHtml).toContain('Second')
    expect(shifted.newHtml).toContain('Inserted')
    // And lesson 3 appears wholly new, though its content existed before as lesson 2.
    expect(changedGroup(groups, 'lesson:3:a').presence).toBe('to-only')
    expect(changedGroup(groups, 'lesson:3:a').newHtml).toContain('Second')
  })

  it('a middle REMOVAL cascades the same way', async () => {
    const groups = await diff(
      sequence(
        lessonTables(1, { title: 'First' }),
        lessonTables(2, { title: 'Doomed' }),
        lessonTables(3, { title: 'Third' }),
      ),
      sequence(lessonTables(1, { title: 'First' }), lessonTables(2, { title: 'Third' })),
    )
    expect(changedKeys(groups).some((k) => k.startsWith('lesson:1:'))).toBe(false)
    expect(changedGroup(groups, 'lesson:2:a').oldHtml).toContain('Doomed')
    expect(changedGroup(groups, 'lesson:2:a').newHtml).toContain('Third')
    expect(changedGroup(groups, 'lesson:3:a').presence).toBe('from-only')
  })
})

describe('a document present in only one version', () => {
  it('diffs the missing side against empty and marks every area changed', async () => {
    renderVersionSectionsCached.mockImplementation(async (_p: unknown, id: number | string) =>
      String(id) === '1'
        ? [{ label: 'Lesson Sequence', html: sequence(lessonTables(1)) }]
        : [
            { label: 'Lesson Sequence', html: sequence(lessonTables(1)) },
            {
              label: 'Summary Table',
              html: table(headerRow('SUMMARY TABLE'), cellRow('<p>Sub-Strand</p>', '<p>SS</p>')),
            },
          ],
    )
    const groups = await diffVersionGroupsCached(payload, 1, 2)

    const summary = groups.filter((g) => g.doc === 'Summary Table')
    expect(summary.map((g) => g.key)).toEqual(['st:header'])
    expect(changedGroup(groups, 'st:header').presence).toBe('to-only')
  })
})
