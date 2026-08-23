/**
 * Edit-recovery projection (design §3) — the pure half, so no DB, no Payload, no request.
 *
 * WHY THESE TESTS EXIST SEPARATELY FROM THE DRIFT GUARD. `proseWhitelistDrift.spec.ts` pins the
 * `*_PROSE` constants to the `canEditProse` field factories, and `projection.ts` imports those same
 * constants — so a field becoming editing-access-editable is picked up here for free. That inheritance covers
 * the CONSTANTS drifting. It does not cover this file *misusing* them: reading the wrong container,
 * capturing a key it should not, or letting a row id escape as a value. Those are the assertions
 * below, and they are the ones that would otherwise be assumed.
 *
 * The security-relevant half is NEGATIVE. A capture that quietly carried `resourceLinks`, `phase` or
 * `rubric` would let a teacher with editing access round-trip admin-owned data through recovery — the exact boundary
 * `applyEditorFieldSplit` enforces at the save path. Positive tests cannot detect that; only naming
 * the forbidden fields and asserting their absence can.
 */
import { describe, expect, it } from 'vitest'

import {
  applyCapture,
  captureAnchors,
  FINAL_EXPLANATION_KEY,
  parseKey,
  projectCapture,
  type CaptureMap,
} from '../../src/lib/editRecovery/projection'

/**
 * Explicit shape rather than inference. Inferring from the literal below gives each array a UNION of
 * its rows' shapes, so reading a field that only one row happens to carry fails to typecheck — an
 * artefact of the fixture, not of the code under test.
 *
 * Prose leaves are `Prose = string | null`, matching Payload's generated types, so the fixture states
 * the real contract instead of casting around it. A test that needs a cast to express a cleared field
 * is describing a narrower type than the code actually accepts.
 */
type Prose = string | null
type FrameworkRow = {
  id: number
  learnerExperience?: Prose
  teacherMoves?: Prose
  phase?: string // admin/system — deliberately NOT Prose
}
type SectionRow = { id: number; prompt?: Prose; exemplar?: string }
type SummaryLessonRow = {
  id: number
  title?: Prose
  observed?: Prose
  learned?: Prose
  explained?: Prose
}
type LessonRow = {
  id: number
  title?: Prose
  overview?: Prose
  teacherReflection?: Prose
  number?: number
  duration?: number
  resourceLinks?: { id: number; url: string }[]
  // Required because every fixture lesson carries them and the round-trip test mutates through
  // them; `summaryTablePrompt` stays optional, since only the first lesson has one.
  slo: Record<string, Prose>
  framework: FrameworkRow[]
  summaryTablePrompt?: Record<string, Prose>
}
type SourceDoc = {
  id: number
  semver: string
  author: string
  meta: Record<string, unknown>
  lessons: LessonRow[]
  finalExplanation: {
    instructions?: Prose
    sections: SectionRow[]
    rubric: { id: number; criterion: string }[]
  }
  summaryTable: { subStrand: string; drivingQuestion: string; lessons: SummaryLessonRow[] }
}

/**
 * A source document carrying, in every container, one whitelisted prose leaf AND at least one
 * admin/system field that must never be captured.
 */
const source = (): SourceDoc => ({
  id: 7,
  semver: '1.0.0',
  author: 'ARES',
  meta: { subject: 'Biology', grade: 4, substrand_id: 'bio_1_4' },
  lessons: [
    {
      id: 11,
      title: 'Cells',
      overview: 'A look at cells.',
      teacherReflection: 'Went well.',
      // admin/system — must not be captured
      number: 1,
      duration: 40,
      resourceLinks: [{ id: 900, url: 'https://example.org/a' }],
      slo: { purpose: 'Understand cells', knowledge: 'Parts', safetyNotes: 'None' },
      summaryTablePrompt: { observed: 'o1', learned: 'l1', explained: 'e1' },
      framework: [
        { id: 21, learnerExperience: 'LE', teacherMoves: 'TM', phase: 'ENGAGE' },
        { id: 22, learnerExperience: 'LE2', teacherMoves: 'TM2', phase: 'EXPLORE' },
      ],
    },
    {
      id: 12,
      title: 'Tissues',
      overview: 'Next up.',
      slo: { purpose: 'Understand tissues' },
      framework: [{ id: 23, learnerExperience: 'LE3', phase: 'EXPLAIN' }],
    },
  ],
  finalExplanation: {
    instructions: 'Do the thing.',
    sections: [
      { id: 31, prompt: 'Explain X', exemplar: 'ADMIN ONLY' },
      { id: 32, prompt: 'Explain Y', exemplar: 'ADMIN ONLY 2' },
    ],
    rubric: [{ id: 41, criterion: 'ADMIN ONLY' }],
  },
  summaryTable: {
    subStrand: 'ADMIN ONLY',
    drivingQuestion: 'ADMIN ONLY',
    lessons: [{ id: 51, title: 'Cells', observed: 'o', learned: 'l', explained: 'e' }],
  },
})

/** Every string value anywhere in a structure — used to prove absence without guessing at shape. */
const allStrings = (v: unknown, acc: string[] = []): string[] => {
  if (typeof v === 'string') acc.push(v)
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, acc))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, acc))
  return acc
}

describe('edit-recovery projection', () => {
  it('captures whitelisted prose from every container, keyed by row id', () => {
    const m = projectCapture(source())
    expect(m['lesson:11']).toEqual({
      title: 'Cells',
      overview: 'A look at cells.',
      teacherReflection: 'Went well.',
    })
    expect(m['slo:11']).toEqual({
      purpose: 'Understand cells',
      knowledge: 'Parts',
      safetyNotes: 'None',
    })
    expect(m['prompt:11']).toEqual({ observed: 'o1', learned: 'l1', explained: 'e1' })
    expect(m['framework:21']).toEqual({ learnerExperience: 'LE', teacherMoves: 'TM' })
    expect(m[FINAL_EXPLANATION_KEY]).toEqual({ instructions: 'Do the thing.' })
    expect(m['section:31']).toEqual({ prompt: 'Explain X' })
    // No `title`: the Summary Table row title is administrator-only (SPEC §205), so it is not
    // teacher prose and edit recovery must not capture it — capturing a field the teacher cannot
    // change would offer to restore work they were never able to do.
    expect(m['summaryLesson:51']).toEqual({ observed: 'o', learned: 'l', explained: 'e' })
  })

  it('NEVER captures admin/system fields, in any container', () => {
    const m = projectCapture(source())
    // By name, per container — the boundary `applyEditorFieldSplit` enforces at save.
    expect(m['lesson:11']).not.toHaveProperty('number')
    expect(m['lesson:11']).not.toHaveProperty('duration')
    expect(m['lesson:11']).not.toHaveProperty('resourceLinks')
    expect(m['framework:21']).not.toHaveProperty('phase')
    expect(m['section:31']).not.toHaveProperty('exemplar')
    // And by value, which catches a leak into a container this test did not think to name.
    const captured = allStrings(m)
    for (const forbidden of [
      'ADMIN ONLY',
      'ADMIN ONLY 2',
      'https://example.org/a',
      'ENGAGE',
      'ARES',
      '1.0.0',
      'bio_1_4',
    ]) {
      expect(captured).not.toContain(forbidden)
    }
    // `rubric`, `meta`, `semver` and `author` have no key at all.
    expect(Object.keys(m).some((k) => k.startsWith('rubric'))).toBe(false)
    expect(m).not.toHaveProperty('meta')
    expect(m).not.toHaveProperty('summaryTable')
  })

  it('stays sparse: a row with no prose gets no key, and a non-string leaf is dropped', () => {
    const m = projectCapture({
      lessons: [
        { id: 1, number: 3 }, // admin-only content ⇒ no key at all
        { id: 2, title: 42 }, // prose key present but not a string ⇒ dropped, so no key
        { id: 3, title: 'kept' },
      ],
    })
    expect(m).not.toHaveProperty('lesson:1')
    expect(m).not.toHaveProperty('lesson:2')
    expect(m['lesson:3']).toEqual({ title: 'kept' })
  })

  /**
   * IDENTITY, asserted structurally rather than through the projection. Comparing
   * `projectCapture(doc)` to `projectCapture(edited)` only proves the two agree on the leaves the
   * projection looks at — it is blind to anything apply might have dropped, reshaped or reordered
   * outside the whitelist. `toEqual` on the whole document is not.
   */
  it('identity: applying a capture of a document to that document changes nothing', () => {
    const s = source()
    const { doc, report } = applyCapture(source(), projectCapture(s))
    expect(doc).toEqual(s)
    expect(report.droppedKeys).toEqual([])
  })

  it('round-trips: applying a capture reproduces exactly the edited prose', () => {
    const base = source()
    const edited = source()
    edited.lessons[0].title = 'EDITED title'
    edited.lessons[0].slo.purpose = 'EDITED purpose'
    // `summaryTablePrompt` is the one container the first version of this test missed, so the whole
    // `prompt:<lessonId>` branch could be deleted from apply with all 8 tests still green. Disabling
    // that branch now fails TWO tests, and the two fail for different reasons — worth knowing, since
    // only one of them is about content: the round-trip below fails on document equality, while the
    // identity test fails on `droppedKeys` (`['prompt:11']` vs `[]`) because the branch never
    // consumed its key. Identity's own document comparison still passes there, the untouched base
    // already carrying its prompt — so the bookkeeping assertion, not the content one, is what makes
    // identity notice a silently skipped container.
    edited.lessons[0].summaryTablePrompt!.observed = 'EDITED prompt observed'
    edited.lessons[0].framework[1].teacherMoves = 'EDITED moves'
    edited.finalExplanation.instructions = 'EDITED instructions'
    edited.finalExplanation.sections[1].prompt = 'EDITED prompt'
    edited.summaryTable.lessons[0].observed = 'EDITED observed'

    const { doc } = applyCapture(base, projectCapture(edited))
    // Whole-document equality: every container, not only the projected leaves.
    expect(doc).toEqual(edited)

    // Spot-check through the real shape too, so a failure names the container.
    const d = doc as SourceDoc
    expect(d.lessons[0].title).toBe('EDITED title')
    expect(d.lessons[0].slo.purpose).toBe('EDITED purpose')
    expect(d.lessons[0].summaryTablePrompt!.observed).toBe('EDITED prompt observed')
    expect(d.lessons[0].framework[1].teacherMoves).toBe('EDITED moves')
    expect(d.finalExplanation.sections[1].prompt).toBe('EDITED prompt')
    expect(d.summaryTable.lessons[0].observed).toBe('EDITED observed')
  })

  /**
   * `null` is a cleared field, not an absent one. If a capture omitted it, restoring would bring the
   * OLD text back — losing precisely the edit (a deletion) that this feature exists to preserve, and
   * losing it in the one direction a user would not think to check.
   */
  it('captures and restores a cleared field as null, distinct from an absent one', () => {
    const cleared = source()
    cleared.lessons[0].title = null
    const m = projectCapture(cleared)
    expect(m['lesson:11']).toHaveProperty('title', null)

    const { doc } = applyCapture(source(), m)
    expect((doc as SourceDoc).lessons[0].title).toBeNull()

    // Absent stays absent: a key the source never had is neither captured nor invented.
    const sparse = projectCapture({ lessons: [{ id: 1, title: 'only title' }] })
    expect(sparse['lesson:1']).toEqual({ title: 'only title' })
    expect(sparse['lesson:1']).not.toHaveProperty('overview')
  })

  it('preserves admin/system values on apply — a capture cannot overwrite them', () => {
    const base = source()
    const hostile = {
      'lesson:11': { title: 'ok', resourceLinks: 'HOSTILE', number: 'HOSTILE', id: 999 },
      'framework:21': { learnerExperience: 'ok', phase: 'HOSTILE' },
      'section:31': { prompt: 'ok', exemplar: 'HOSTILE' },
    } as unknown as CaptureMap

    const { doc } = applyCapture(base, hostile)
    const d = doc as SourceDoc
    expect(d.lessons[0].resourceLinks).toEqual([{ id: 900, url: 'https://example.org/a' }])
    expect(d.lessons[0].number).toBe(1)
    expect(d.lessons[0].framework[0].phase).toBe('ENGAGE')
    expect(d.finalExplanation.sections[0].exemplar).toBe('ADMIN ONLY')
    expect(allStrings(doc)).not.toContain('HOSTILE')
  })

  it('drops an unknown row-id key: never creates a row, never restores an id as a value', () => {
    const base = source()
    const withGhost: CaptureMap = {
      'lesson:11': { title: 'kept' },
      'lesson:99999': { title: 'GHOST' }, // row does not exist in the source
      'framework:88888': { teacherMoves: 'GHOST FW' },
      'section:77777': { prompt: 'GHOST SECTION' },
      'summaryLesson:66666': { title: 'GHOST SUMMARY' },
      'notAScope:11': { title: 'GHOST SCOPE' },
    }

    const { doc, report } = applyCapture(base, withGhost)
    const d = doc as SourceDoc

    // Cardinality is untouched everywhere — structure comes only from the source.
    expect(d.lessons).toHaveLength(2)
    expect(d.lessons[0].framework).toHaveLength(2)
    expect(d.finalExplanation.sections).toHaveLength(2)
    expect(d.summaryTable.lessons).toHaveLength(1)
    // No ghost content landed anywhere.
    expect(allStrings(doc).filter((s) => s.startsWith('GHOST'))).toEqual([])
    // The real key still applied, and the ghosts are reported rather than swallowed.
    expect(d.lessons[0].title).toBe('kept')
    expect([...report.droppedKeys].sort()).toEqual([
      'framework:88888',
      'lesson:99999',
      'notAScope:11',
      'section:77777',
      'summaryLesson:66666',
    ])
  })

  it('never writes a row id as a field value, even when the capture supplies one', () => {
    const base = source()
    const { doc } = applyCapture(base, {
      'lesson:11': { id: '424242', title: 'ok' },
    } as unknown as CaptureMap)
    const d = doc as SourceDoc
    expect(d.lessons[0].id).toBe(11)
    expect(allStrings(doc)).not.toContain('424242')
  })

  it('is total on absent containers and empty input', () => {
    expect(projectCapture(null)).toEqual({})
    expect(projectCapture({})).toEqual({})
    expect(projectCapture({ lessons: 0, finalExplanation: null, summaryTable: 0 })).toEqual({})
    const { doc, report } = applyCapture({ id: 1 }, { 'lesson:1': { title: 'x' } })
    expect(doc).toEqual({ id: 1 })
    expect(report.droppedKeys).toEqual(['lesson:1'])
    expect(applyCapture(source(), null).report.applied).toBe(0)
  })
})

/**
 * `parseKey` is exported for PR 2's restore UI, which must explain a partial restore and therefore
 * needs the scope back out of a `droppedKeys` entry. Tested here rather than shipped unexercised —
 * an exported function with no caller and no test is a format contract nobody has checked.
 */
describe('parseKey — the decode half of the key format', () => {
  it('round-trips every scope the projection emits', () => {
    const m = projectCapture(source())
    for (const key of Object.keys(m)) {
      const { scope, rowId } = parseKey(key)
      expect(scope).toBeTruthy()
      expect(rowId === null ? scope : `${scope}:${rowId}`).toBe(key)
    }
  })

  it('returns a null rowId for the singleton, which has no row', () => {
    expect(parseKey(FINAL_EXPLANATION_KEY)).toEqual({
      scope: 'finalExplanation',
      rowId: null,
    })
  })

  it('splits on the FIRST colon, so an id containing one survives', () => {
    // Payload row ids are `character varying`, so a colon is not structurally impossible. Splitting
    // on the last colon, or with a bare `split(':')` and `[1]`, would silently truncate the id — the
    // exact failure a `key.split(':')` written in a UI component would ship.
    expect(parseKey('lesson:a:b:c')).toEqual({ scope: 'lesson', rowId: 'a:b:c' })
    expect(parseKey('framework:x:y')).toEqual({ scope: 'framework', rowId: 'x:y' })
  })
})

/**
 * Storability normalisation. These live in the UNIT suite because they are a pure string rule — an
 * earlier version tested them through Postgres, which meant needing a database to prove a `.replace()`.
 *
 * The NUL case is the one that matters: the first fix handled unpaired surrogates only, and NUL went
 * straight through it. Both are hard Postgres errors (`invalid input syntax for type json` and
 * `unsupported Unicode escape sequence: \u0000 cannot be converted to text`), so either one made
 * `capture` THROW rather than return a result — the contract that fix existed to protect. Verified
 * against the live database before being written here.
 */
describe('prose normalisation — the class, not two instances', () => {
  const proseOf = (title: string) => projectCapture({ lessons: [{ id: 'L1', title }] })['lesson:L1']

  it('replaces an unpaired HIGH surrogate', () => {
    expect(proseOf('before \uD800 after')).toEqual({ title: 'before \uFFFD after' })
  })

  it('replaces an unpaired LOW surrogate', () => {
    expect(proseOf('before \uDC00 after')).toEqual({ title: 'before \uFFFD after' })
  })

  it('replaces NUL — which arrives off the wire, not from a textarea', () => {
    // A JSON body may legally carry the escape; `JSON.parse` yields a real NUL, no browser involved.
    const fromWire = JSON.parse('{"t":"a\\u0000b"}').t as string
    expect(fromWire).toHaveLength(3)
    expect(proseOf(fromWire)).toEqual({ title: 'a\uFFFDb' })
  })

  it('leaves a WELL-FORMED surrogate pair intact', () => {
    // Two code units forming one emoji. Touching this would corrupt every emoji a teacher types.
    expect(proseOf('grin \u{1F600} ok')).toEqual({ title: 'grin \u{1F600} ok' })
  })

  it('leaves ordinary text — including accents and curly quotes — untouched', () => {
    const text = 'caf\u00e9 \u2014 the teacher\u2019s note \u2026 \u4f60\u597d'
    expect(proseOf(text)).toEqual({ title: text })
  })

  it('apply does NOT re-normalise — the column is the read-path guarantee', () => {
    // Asserted so the asymmetry is documented rather than discovered. `jsonb` cannot store an unpaired
    // surrogate or a NUL, so no capture in the table carries one and `applyCapture`'s input is
    // storable by construction. Handing it one directly, as here, reaches past the only path that
    // exists — and it passes straight through, which is the honest behaviour to record.
    const { doc } = applyCapture(
      { lessons: [{ id: 'L1', title: 'original' }] },
      { 'lesson:L1': { title: 'bad \uD800 value' } },
    )
    const lessons = (doc as { lessons: { title: string }[] }).lessons
    expect(lessons[0].title).toBe('bad \uD800 value')
  })
})

/**
 * `captureAnchors` — how the restore prompt names and orders what it found.
 *
 * ⚑ This exists because the capture map CANNOT answer "which lesson is this?" on its own. Its keys
 * are `<scope>:<rowId>` with no ordinal, and it comes back from a JSONB column, which reorders object
 * keys by length then bytes. A prompt that numbered groups from the map's own order would confidently
 * label recovered prose "Lesson 2" when the teacher's Lesson 2 was never touched — a wrong number is
 * worse than no number, because the user acts on it.
 */
describe('captureAnchors — naming recovered prose after the plan the user can see', () => {
  it('names every capture key `projectCapture` produces', () => {
    const doc = source()
    const anchored = new Set(captureAnchors(doc).map((a) => a.key))
    for (const key of Object.keys(projectCapture(doc))) {
      expect(anchored.has(key), `${key} has no heading`).toBe(true)
    }
  })

  it('gives the three lesson-keyed scopes ONE shared heading', () => {
    const headings = new Map(captureAnchors(source()).map((a) => [a.key, a.heading]))
    // All keyed on the lesson row's own id: its prose, its outcomes, its summary-table prompt.
    expect(headings.get('lesson:11')).toBe('Lesson 1')
    expect(headings.get('slo:11')).toBe('Lesson 1')
    expect(headings.get('prompt:11')).toBe('Lesson 1')
    // Framework rows have ids of their own and are phases WITHIN that lesson.
    expect(headings.get('framework:21')).toBe('Lesson 1 — phase 1')
    expect(headings.get('framework:22')).toBe('Lesson 1 — phase 2')
  })

  /**
   * ⚑ The lesson's OWN `number`, not its array index. That is what the teacher sees in the editor and
   * on the printed plan; a plan whose lessons are numbered from 3 would otherwise be relabelled from 1
   * by the one panel whose job is to be recognisable.
   */
  it("uses the lesson's own number, falling back to position when it has none", () => {
    const doc = source()
    doc.lessons[0].number = 4
    delete doc.lessons[1].number
    const headings = new Map(captureAnchors(doc).map((a) => [a.key, a.heading]))
    expect(headings.get('lesson:11')).toBe('Lesson 4')
    expect(headings.get('lesson:12'), 'unnumbered falls back to its position').toBe('Lesson 2')
  })

  it('names the singletons and the trailing sections', () => {
    const headings = new Map(captureAnchors(source()).map((a) => [a.key, a.heading]))
    expect(headings.get(FINAL_EXPLANATION_KEY)).toBe('Final explanation')
    expect(headings.get('section:31')).toBe('Final explanation — section 1')
    expect(headings.get('summaryLesson:51')).toBe('Summary table — row 1')
  })

  /**
   * ⚑ ORDER is the other half of the contract, and the one JSONB destroys. The prompt renders groups
   * by walking this array, so document order here IS reading order there.
   */
  it('returns keys in document order', () => {
    const keys = captureAnchors(source()).map((a) => a.key)
    expect(keys.indexOf('lesson:11')).toBeLessThan(keys.indexOf('lesson:12'))
    expect(keys.indexOf('framework:21')).toBeLessThan(keys.indexOf('framework:22'))
    // ⚑ The NESTED boundary: a lesson's phases come before the NEXT lesson, not after every lesson.
    // Without this, an implementation that emitted all lessons first and all frameworks afterwards
    // would satisfy every other assertion here while reordering what the restore prompt reads out.
    expect(keys.indexOf('framework:22')).toBeLessThan(keys.indexOf('lesson:12'))
    expect(keys.indexOf('lesson:12')).toBeLessThan(keys.indexOf(FINAL_EXPLANATION_KEY))
    expect(keys.indexOf(FINAL_EXPLANATION_KEY)).toBeLessThan(keys.indexOf('summaryLesson:51'))
  })

  /**
   * A row deleted since the capture has no anchor — the same dropped-key case `applyCapture` refuses
   * to restore. The prompt falls back to a heading that says so, which is only possible because this
   * returns nothing rather than inventing a number.
   */
  it('has no heading for a row the plan no longer has', () => {
    const doc = source()
    doc.lessons = [doc.lessons[1]]
    expect(captureAnchors(doc).some((a) => a.key === 'lesson:11')).toBe(false)
  })

  it('is empty for a missing document rather than throwing', () => {
    expect(captureAnchors(null)).toEqual([])
    expect(captureAnchors(undefined)).toEqual([])
  })
})
