/**
 * Edit-recovery projection (design §3) — the pure half, so no DB, no Payload, no request.
 *
 * WHY THESE TESTS EXIST SEPARATELY FROM THE DRIFT GUARD. `proseWhitelistDrift.spec.ts` pins the
 * `*_PROSE` constants to the `canEditProse` field factories, and `projection.ts` imports those same
 * constants — so a field becoming Editor-editable is picked up here for free. That inheritance covers
 * the CONSTANTS drifting. It does not cover this file *misusing* them: reading the wrong container,
 * capturing a key it should not, or letting a row id escape as a value. Those are the assertions
 * below, and they are the ones that would otherwise be assumed.
 *
 * The security-relevant half is NEGATIVE. A capture that quietly carried `resourceLinks`, `phase` or
 * `rubric` would let an Editor round-trip admin-owned data through recovery — the exact boundary
 * `applyEditorFieldSplit` enforces at the save path. Positive tests cannot detect that; only naming
 * the forbidden fields and asserting their absence can.
 */
import { describe, expect, it } from 'vitest'

import {
  applyCapture,
  FINAL_EXPLANATION_KEY,
  projectCapture,
  type CaptureMap,
} from '../../src/lib/editRecovery/projection'

/**
 * Explicit shape rather than inference. Inferring from the literal below gives each array a UNION of
 * its rows' shapes, so reading a field that only one row happens to carry fails to typecheck — an
 * artefact of the fixture, not of the code under test.
 */
type FrameworkRow = {
  id: number
  learnerExperience?: string
  teacherMoves?: string
  phase?: string
}
type SectionRow = { id: number; prompt?: string; exemplar?: string }
type SummaryLessonRow = {
  id: number
  title?: string
  observed?: string
  learned?: string
  explained?: string
}
type LessonRow = {
  id: number
  title?: string
  overview?: string
  teacherReflection?: string
  number?: number
  duration?: number
  resourceLinks?: { id: number; url: string }[]
  // Required because every fixture lesson carries them and the round-trip test mutates through
  // them; `summaryTablePrompt` stays optional, since only the first lesson has one.
  slo: Record<string, string>
  framework: FrameworkRow[]
  summaryTablePrompt?: Record<string, string>
}
type SourceDoc = {
  id: number
  semver: string
  author: string
  meta: Record<string, unknown>
  lessons: LessonRow[]
  finalExplanation: {
    instructions?: string
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
    expect(m['summaryLesson:51']).toEqual({
      title: 'Cells',
      observed: 'o',
      learned: 'l',
      explained: 'e',
    })
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

  it('round-trips: applying a capture reproduces exactly the edited prose', () => {
    const base = source()
    const edited = source()
    edited.lessons[0].title = 'EDITED title'
    edited.lessons[0].slo.purpose = 'EDITED purpose'
    edited.lessons[0].framework[1].teacherMoves = 'EDITED moves'
    edited.finalExplanation.instructions = 'EDITED instructions'
    edited.finalExplanation.sections[1].prompt = 'EDITED prompt'
    edited.summaryTable.lessons[0].observed = 'EDITED observed'

    const { doc } = applyCapture(base, projectCapture(edited))
    expect(projectCapture(doc)).toEqual(projectCapture(edited))

    // Spot-check through the real shape, not just the projection of it.
    const d = doc as SourceDoc
    expect(d.lessons[0].title).toBe('EDITED title')
    expect(d.lessons[0].slo.purpose).toBe('EDITED purpose')
    expect(d.lessons[0].framework[1].teacherMoves).toBe('EDITED moves')
    expect(d.finalExplanation.sections[1].prompt).toBe('EDITED prompt')
    expect(d.summaryTable.lessons[0].observed).toBe('EDITED observed')
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
    expect(report.droppedKeys.sort()).toEqual([
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
