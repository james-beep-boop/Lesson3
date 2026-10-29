/**
 * The editing-access field-split's GROUP containers — `finalExplanation` and `summaryTable`
 * (`src/hooks/fieldSplit.ts`).
 *
 * WHAT THIS PINS, and why it did not exist before. The `lessons` guard tests PRESENCE
 * (`'lessons' in data`); the two group guards used to test TRUTHINESS. The gap between those was
 * reachable by a teacher with editing access through `POST /:id/save-as-new`, in two shapes:
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
 * ⚑ EVERY REJECTION ASSERTS `Forbidden`, NOT A BARE THROW. The pre-fix code threw a `TypeError` on
 * several of these inputs (`'sections' in 42`), so a bare `.toThrow()` passes against the very bug
 * this file exists to pin — the trap `emptyArraySerialization.spec.ts` documents for this same
 * family. Two of these cases were originally written that way and proved nothing.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`.
 */
import { describe, expect, it } from 'vitest'
import { Forbidden } from 'payload'

import { applyEditorFieldSplit } from '../../src/hooks/fieldSplit.js'
import { VERSION_EDITOR_KEYS } from '../../src/hooks/bundleVersion.js'

/**
 * A stored version carrying admin-authored content in both group containers.
 *
 * A FUNCTION, not a const: `overlayProse` shallow-copies, so a shared object would let `toEqual`
 * compare a value against itself and prove nothing. Only what the assertions read is modelled —
 * `subjectGrade` for the authority lookup, one id-bearing lesson to satisfy the cardinality check,
 * and the two containers under test.
 */
const original = () => ({
  subjectGrade: 7,
  lessons: [{ id: 'L1' }],
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

/** A teacher with editing access: no roles, and an `editor` grant on the document's own subject-grade. */
const editor = { id: 99, roles: [], assignments: [{ subjectGrade: 7, role: 'editor' }] }

const runSplit = (data: Record<string, unknown>) =>
  applyEditorFieldSplit({
    data,
    originalDoc: original() as never,
    operation: 'update',
    req: { user: editor } as never,
    editorTopLevelKeys: VERSION_EDITOR_KEYS,
  }) as Record<string, unknown>

describe('group containers cannot be deleted by a teacher with editing access', () => {
  it.each([null, 0, 'nope', 42, []])('REFUSES a malformed finalExplanation (%o)', (bad) => {
    expect(() => runSplit({ finalExplanation: bad })).toThrow(Forbidden)
  })

  it.each([null, 0, 'nope', 42, []])('REFUSES a malformed summaryTable (%o)', (bad) => {
    expect(() => runSplit({ summaryTable: bad })).toThrow(Forbidden)
  })

  /**
   * ⚑ THE CASE THE NULL BUG EXPOSED. Omitting the key was as effective as nulling it, and no guard
   * can fire on a key that is not there — so the fix is that the container is REBUILT from the
   * original rather than merely checked. Absent means unchanged.
   */
  it('restores OMITTED containers from the original, whole', () => {
    const out = runSplit({ lessons: original().lessons })
    expect(out.finalExplanation).toEqual(original().finalExplanation)
    expect(out.summaryTable).toEqual(original().summaryTable)
  })

  /**
   * ⚑ THE RECURRENCE GUARD, parametrised over the REAL `VERSION_EDITOR_KEYS`.
   *
   * Every key in that set is exempt from the blanket restore, and each therefore carries an unwritten
   * obligation to re-derive itself in step 2. That unmet obligation IS the bug above. A fourth
   * container added to the set without a `rebuildGroup` call fails here by name, instead of shipping
   * the same hole again.
   *
   * `lessons` is the one deliberate exclusion: absence must reach `validateGeneratable` as a loud 422
   * rather than be silently restored. `updatedAt` is metadata, not a container.
   */
  const CONTAINERS = [...VERSION_EDITOR_KEYS].filter((k) => k !== 'lessons' && k !== 'updatedAt')

  it.each(CONTAINERS)('container %s is restored when omitted', (key) => {
    const out = runSplit({ lessons: original().lessons })
    expect(out[key], `${key} is exempt from the blanket restore and must be rebuilt`).toEqual(
      (original() as Record<string, unknown>)[key],
    )
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
    expect(fe.instructions, 'prose is the one submitted under editing access').toBe(
      'editor instructions',
    )

    const sections = fe.sections as Record<string, unknown>[]
    expect(sections[0].prompt, 'section prose is the one submitted under editing access').toBe(
      'editor prompt',
    )
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
    // The row TITLE is administrator-only — see the ⚑ on `SUMMARY_LESSON_PROSE` in
    // `lib/proseFields.ts`. It used to overlay here; the submitted value is now discarded and the
    // source title preserved, the same way the two headers above are.
    expect(rows[0].title, 'admin-only row title preserved').toBe('row')
    expect(rows[0].observed).toBe('editor obs')
  })

  /**
   * Cardinality inside a group container. `emptyArraySerialization.spec.ts` already covers added and
   * reordered `sections`, so this takes the row sets that spec does not: `rubric` and
   * `summaryTable.lessons`. All three now run through one `guardRows` path, so covering the
   * uncovered two is what actually widens the guard.
   */
  it.each([
    ['finalExplanation', { rubric: [{ id: 'R1' }, { id: 'R2' }] }],
    ['summaryTable', { lessons: [] }],
  ])('still refuses a cardinality change in %s', (key, container) => {
    expect(() => runSplit({ [key]: container })).toThrow(Forbidden)
  })
})

/**
 * The OMISSION twin of the container bug above, for keys that are NOT editor containers (audit
 * F-C31-001, 2026-10-28). The blanket restore used to iterate only the SUBMITTED keys, so omitting
 * `unit` — administrator-authored, with no rebuild of its own — let save-as-new create a candidate
 * without it. The restore now walks the original's keys too.
 */
describe('administrator-owned top-level keys survive being omitted', () => {
  const withUnit = () => ({
    ...original(),
    meta: { titleDoc: 'admin title', substrand_id: '7.1' },
    unit: { content: 'admin unit overview' },
  })
  const split = (data: Record<string, unknown>) =>
    applyEditorFieldSplit({
      data,
      originalDoc: withUnit() as never,
      operation: 'update',
      req: { user: editor } as never,
      editorTopLevelKeys: VERSION_EDITOR_KEYS,
    }) as Record<string, unknown>

  it.each(['unit', 'meta'])('restores an omitted %s from the original', (key) => {
    const out = split({ lessons: original().lessons })
    expect(out[key]).toEqual((withUnit() as Record<string, unknown>)[key])
  })

  it('still replaces a submitted unit with the original', () => {
    const out = split({ lessons: original().lessons, unit: { content: 'HOSTILE' } })
    expect(out.unit).toEqual({ content: 'admin unit overview' })
  })
})

/**
 * Non-object members of a submitted row array (audit F-C31-002): `idsOf` read `.id` from each, so
 * `[null]` threw a TypeError and surfaced as a 500 instead of the guard's controlled refusal.
 */
describe('row arrays with non-object members are refused, not crashed on', () => {
  it.each([
    ['lessons', { lessons: [null] }],
    ['framework', { lessons: [{ id: 'L1', framework: [null] }] }],
    ['finalExplanation.sections', { finalExplanation: { sections: [null] } }],
    ['finalExplanation.rubric', { finalExplanation: { rubric: [null] } }],
    ['summaryTable.lessons', { summaryTable: { lessons: [null] } }],
  ])('%s: [null] → Forbidden', (_path, data) => {
    expect(() => runSplit(data)).toThrow(Forbidden)
  })

  it('does not throw a TypeError for an administrator either', () => {
    const siteAdmin = { id: 1, roles: ['siteAdmin'], assignments: [] }
    expect(() =>
      applyEditorFieldSplit({
        data: { lessons: [null] },
        originalDoc: original() as never,
        operation: 'update',
        req: { user: siteAdmin } as never,
        editorTopLevelKeys: VERSION_EDITOR_KEYS,
      }),
    ).not.toThrow()
  })
})

/**
 * SPEC §5 "stored faithfully, but never editable by anyone" (audit F-C71-002; operator decision
 * 2026-10-29). Administrators pass through the teacher whitelist, so these are restored from the
 * source for every role.
 */
describe('ARES contract fields nobody may edit', () => {
  const source = () => ({
    subjectGrade: 7,
    meta: { titleDoc: 'title', outputDir: 'out/7.1' },
    lessons: [{ id: 'L1', title: 'one', substrand: '7.1 Cells', aresKeywords: 'cell, membrane' }],
  })
  const subjectAdmin = {
    id: 5,
    roles: [],
    assignments: [{ subjectGrade: 7, role: 'subjectAdmin' }],
  }
  const siteAdmin = { id: 1, roles: ['siteAdmin'], assignments: [] }
  const splitAs = (user: unknown, data: Record<string, unknown>) =>
    applyEditorFieldSplit({
      data,
      originalDoc: source() as never,
      operation: 'update',
      req: { user } as never,
      editorTopLevelKeys: VERSION_EDITOR_KEYS,
    }) as { meta: Record<string, unknown>; lessons: Record<string, unknown>[] }

  it.each([
    ['a Subject Admin', subjectAdmin],
    ['a Site Admin', siteAdmin],
  ])('%s cannot change them, but still edits the rest', (_who, user) => {
    const out = splitAs(user, {
      meta: { titleDoc: 'new title', outputDir: 'HOSTILE' },
      lessons: [{ id: 'L1', title: 'new', substrand: 'HOSTILE', aresKeywords: 'HOSTILE' }],
    })
    expect(out.meta).toMatchObject({ titleDoc: 'new title', outputDir: 'out/7.1' })
    expect(out.lessons[0]).toMatchObject({
      title: 'new',
      substrand: '7.1 Cells',
      aresKeywords: 'cell, membrane',
    })
  })

  it('a duplicated lesson keeps a value the source already holds, and drops an invented one', () => {
    const out = splitAs(subjectAdmin, {
      lessons: [
        source().lessons[0],
        { title: 'copy', substrand: '7.1 Cells', aresKeywords: 'INVENTED' },
      ],
    })
    expect(out.lessons[1].substrand).toBe('7.1 Cells')
    expect(out.lessons[1]).not.toHaveProperty('aresKeywords')
  })
})
