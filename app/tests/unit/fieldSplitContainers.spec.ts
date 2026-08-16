/**
 * The Editor field-split's GROUP containers — `finalExplanation` and `summaryTable`
 * (`src/hooks/fieldSplit.ts`).
 *
 * WHAT THIS PINS, and why it did not exist before. The `lessons` guard tests PRESENCE
 * (`'lessons' in data`); the two group guards used to test TRUTHINESS. The gap between those was
 * reachable by an Editor through `POST /:id/save-as-new`, in two shapes:
 *
 *   - submitting `finalExplanation: null` — the cardinality check was skipped because null is falsy;
 *   - simply OMITTING the key — nothing to be falsy about, and nothing restored it either.
 *
 * Both slipped the blanket restore in step 2 as well, because `editorTopLevelKeys` deliberately
 * exempts these keys from it, so the group reached `payload.create` as null/absent and the
 * admin-authored content was dropped from the new version.
 *
 * ⚑ NOTHING DOWNSTREAM WOULD HAVE CAUGHT IT, which is the reason this is a guard rather than a
 * nicety: `validateGeneratable` refuses a version with no `lessons`, but a missing
 * finalExplanation/summaryTable is only a non-blocking `deliverableWarnings` entry. `lessons` was
 * protected by that gate; its two siblings were protected by nothing.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`.
 */
import { describe, expect, it } from 'vitest'

import { applyEditorFieldSplit } from '../../src/hooks/fieldSplit.js'

const EDITOR_KEYS = new Set(['lessons', 'finalExplanation', 'summaryTable', 'updatedAt'])

/** A stored version with admin-authored content in all three containers. */
const original = () => ({
  id: 1,
  subjectGrade: 7,
  meta: { subject: 'Biology', grade: 10, substrand_id: 'B10.1', titleDoc: 'Cells' },
  lessons: [
    {
      id: 'L1',
      title: 'Lesson one',
      slo: { purpose: 'admin purpose' },
      summaryTablePrompt: { observed: 'o' },
      framework: [{ id: 'F1', phase: 'Engage', learnerExperience: 'x' }],
    },
  ],
  finalExplanation: {
    instructions: 'admin instructions',
    sections: [{ id: 'S1', prompt: 'admin prompt', adminOnly: 'keep me' }],
    rubric: [{ id: 'R1', criterion: 'admin criterion' }],
  },
  summaryTable: {
    subStrand: 'admin sub-strand',
    drivingQuestion: 'admin question',
    lessons: [{ id: 'SL1', title: 'row', observed: 'obs' }],
  },
})

/** An Editor: no roles, no assignments beyond an `editor` grant on the document's subject-grade. */
const editor = { id: 99, roles: [], assignments: [{ subjectGrade: 7, role: 'editor' }] }

const runSplit = (data: Record<string, unknown>) =>
  applyEditorFieldSplit({
    data,
    originalDoc: original() as never,
    operation: 'update',
    req: { user: editor, t: ((k: string) => k) as never } as never,
    editorTopLevelKeys: EDITOR_KEYS,
  }) as Record<string, unknown>

describe('group containers cannot be deleted by an Editor', () => {
  it('REFUSES a null finalExplanation rather than passing it through', () => {
    expect(() => runSplit({ finalExplanation: null })).toThrow()
  })

  it('REFUSES a null summaryTable', () => {
    expect(() => runSplit({ summaryTable: null })).toThrow()
  })

  it.each([0, 'nope', 42, []])('REFUSES the malformed container %o', (bad) => {
    expect(() => runSplit({ finalExplanation: bad })).toThrow()
  })

  /**
   * ⚑ THE CASE THE NULL BUG EXPOSED. Omitting the key was as effective as nulling it, and no guard
   * could fire on a key that is not there — so the fix is that the container is REBUILT from the
   * original rather than merely checked. Absent means unchanged.
   */
  it('restores an OMITTED finalExplanation from the original, whole', () => {
    const out = runSplit({ lessons: original().lessons })
    expect(out.finalExplanation).toEqual(original().finalExplanation)
  })

  it('restores an OMITTED summaryTable from the original, whole', () => {
    const out = runSplit({ lessons: original().lessons })
    expect(out.summaryTable).toEqual(original().summaryTable)
  })
})

describe('group containers still accept legitimate prose edits', () => {
  it('overlays finalExplanation prose while preserving admin fields and row structure', () => {
    const out = runSplit({
      finalExplanation: {
        instructions: 'editor instructions',
        sections: [{ id: 'S1', prompt: 'editor prompt', adminOnly: 'HOSTILE' }],
        rubric: [{ id: 'R1', criterion: 'HOSTILE' }],
      },
    })
    const fe = out.finalExplanation as Record<string, unknown>
    expect(fe.instructions, 'prose is the Editor’s').toBe('editor instructions')

    const sections = fe.sections as Record<string, unknown>[]
    expect(sections[0].prompt, 'section prose is the Editor’s').toBe('editor prompt')
    expect(sections[0].adminOnly, 'admin subfields survive untouched').toBe('keep me')

    const rubric = fe.rubric as Record<string, unknown>[]
    expect(rubric[0].criterion, 'rubric is admin-owned — the submission is ignored').toBe(
      'admin criterion',
    )
  })

  it('overlays summaryTable row prose but not its admin-only headers', () => {
    const out = runSplit({
      summaryTable: {
        subStrand: 'HOSTILE',
        drivingQuestion: 'HOSTILE',
        lessons: [{ id: 'SL1', title: 'editor row', observed: 'editor obs' }],
      },
    })
    const st = out.summaryTable as Record<string, unknown>
    expect(st.subStrand, 'admin-only header preserved').toBe('admin sub-strand')
    expect(st.drivingQuestion, 'admin-only header preserved').toBe('admin question')

    const rows = st.lessons as Record<string, unknown>[]
    expect(rows[0].title).toBe('editor row')
    expect(rows[0].observed).toBe('editor obs')
  })

  it('still refuses a cardinality change inside a group container', () => {
    expect(() =>
      runSplit({
        finalExplanation: { sections: [{ id: 'S1', prompt: 'a' }, { id: 'S2', prompt: 'new' }] },
      }),
    ).toThrow()
  })
})
