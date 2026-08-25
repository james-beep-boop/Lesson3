/**
 * `captureDiff` and `applyCapture` must agree about what a restore changes.
 *
 * ⚑ THIS IS THE TEST THE 2026-08-23 DEFECT WAS MISSING. The restore preview and the restore itself
 * answered "will this leaf be written?" in two different modules, in two different vocabularies, and
 * they disagreed about the most destructive answer: `overlay` keys on `k in leaves`, so a captured
 * `''` CLEARS the field, while the preview's truthiness filter read the same `''` as "nothing to
 * show". The panel could report "Nothing in these changes differs from the saved version" and then
 * delete a paragraph.
 *
 * The first repair wrote the rule down a second time in the display module. That left the drift fully
 * intact and immediately produced a fresh, opposite-direction disagreement — the copy normalised any
 * non-string to `''` where `overlay` guards with `isProseValue`, so a malformed leaf would have shown
 * as "Emptied" while the apply left the field alone. Both now call one `willApply`.
 *
 * ⚑ So this file does NOT test `captureDiff` against a hand-written expectation. It runs the real
 * `applyCapture` over a real document and checks the preview against what actually moved. A future
 * edit to either side that breaks the correspondence fails HERE, the only place that can see both.
 *
 * ⚑ THE CLAIM IS "NEVER MISSES", NOT "EXACTLY" — narrowed 2026-08-23 after review, because the
 * broader claim was false. `applyCapture` also restricts each scope to its prose whitelist while
 * `captureDiff` reports every differing leaf, so the preview is a SUPERSET. That direction is
 * deliberate (`projection.ts` carries the reasoning): missing a change is what caused the defect this
 * file exists for; over-reporting shows a row that turns out not to move, and is what keeps a
 * schema-mismatched capture's retired fields readable. Both directions are pinned below.
 */
import { describe, expect, it } from 'vitest'

import {
  applyCapture,
  captureDiff,
  projectCapture,
  type CaptureMap,
} from '../../src/lib/editRecovery/projection'

/** A minimal document shaped like the real one: one lesson with prose leaves. */
const doc = (overview: unknown, reflection: unknown) => ({
  id: 1,
  lessons: [{ id: 'L1', overview, teacherReflection: reflection }],
})

/** Which `lessons[0]` prose leaves actually changed when the capture was applied. */
const actuallyChanged = (base: ReturnType<typeof doc>, capture: CaptureMap): string[] => {
  const { doc: after } = applyCapture(base, capture)
  const before = base.lessons[0] as Record<string, unknown>
  const post = (after.lessons as Record<string, unknown>[])[0]!
  return ['overview', 'teacherReflection'].filter((k) => (before[k] ?? '') !== (post[k] ?? ''))
}

/** What the PREVIEW says will change, for the same pair. */
const predicted = (base: ReturnType<typeof doc>, capture: CaptureMap): string[] =>
  Object.keys(captureDiff(projectCapture(base), capture)['lesson:L1'] ?? {}).sort()

describe.each([
  ['a plain edit', 'saved text', 'edited text'],
  ['CLEARING a filled field', 'saved text', ''],
  ['clearing with an explicit null', 'saved text', null],
  ['filling a field that was empty', '', 'newly written'],
  ['filling a field that was null', null, 'newly written'],
  ['no change at all', 'identical', 'identical'],
  ['empty against null — both mean empty', null, ''],
  ['null against empty — the other direction', '', null],
  ['whitespace over an empty field', '', '   '],
])('%s', (_name, saved, captured) => {
  it('the preview never misses a leaf the restore moves', () => {
    const base = doc(saved, 'untouched')
    const capture: CaptureMap = {
      'lesson:L1': { overview: captured as string | null, teacherReflection: 'untouched' },
    }
    const moved = actuallyChanged(base, capture).sort()
    // Superset: everything that actually moves must have been predicted. For whitelisted prose —
    // which is all a real capture holds — the two are equal, and this asserts that too.
    expect(predicted(base, capture)).toEqual(expect.arrayContaining(moved))
    expect(predicted(base, capture)).toEqual(moved)
  })
})

describe('the divergence the second repair introduced', () => {
  it('ignores a MALFORMED leaf, exactly as the overlay does', () => {
    // ⚑ `CaptureMap` types this out, but the map arrives from a JSONB column, so the runtime shape is
    // not guaranteed. `overlay` guards with `isProseValue` and skips a non-string, non-null value;
    // the hand-copied preview rule normalised it to '' and would have shown the field as "Emptied"
    // while the restore left it untouched — a fresh disagreement introduced by the fix for the first.
    const base = doc('saved text', 'untouched')
    const capture = { 'lesson:L1': { overview: 42 as unknown as string } } as CaptureMap
    expect(predicted(base, capture), 'a malformed leaf is not a change').toEqual([])
    expect(actuallyChanged(base, capture), 'and the overlay does not write it either').toEqual([])
  })
})

describe('and it still shows an ORPHAN key, which the restore drops', () => {
  it('keeps a row the plan no longer has, because that prose can only be copied out', () => {
    // ⚑ The one INTENDED asymmetry. `applyCapture` never introduces a key, so an orphan is reported
    // in `droppedKeys` and never written — but the panel must still show it, or a stale capture's
    // work becomes unreadable. This is why `captureDiff` is map-to-map and never consults the doc.
    const base = doc('saved text', 'untouched')
    const capture: CaptureMap = { 'lesson:GONE': { overview: 'work from a deleted lesson' } }

    expect(captureDiff(projectCapture(base), capture)['lesson:GONE']).toEqual({
      overview: { was: '', now: 'work from a deleted lesson' },
    })
    const { report } = applyCapture(base, capture)
    expect(report.droppedKeys, 'while the restore itself drops it').toContain('lesson:GONE')
  })
})

describe('when the saved projection has NO entry for the key', () => {
  /**
   * ⚑ WHY AN ABSENT SAVED KEY IS SAFELY READ AS EMPTY — recorded because a review read it as a bug,
   * and the argument that it is not depends on three facts that are not visible from the comparison
   * line alone. The concern: `savedValues?.[field] ?? ''` turns a missing saved field into `''`, so a
   * captured `''` compares equal and is dropped — could that hide a clearing?
   *
   * It cannot, and these cases are the proof rather than the assertion:
   *
   *   1. `projectCapture`'s `put` keeps the map SPARSE — a row with no prose at all gets no entry. So
   *      an absent key means "this row had nothing stored", and writing `''` over nothing changes
   *      nothing a reader would see.
   *   2. `applyCapture` NEVER INTRODUCES A KEY (`overlay`'s contract, and `report.droppedKeys`), so an
   *      absent key that means "this row is not in the document" is not restored at all.
   *   3. A row that DOES hold prose always has an entry, so the dangerous shape — stored text about to
   *      be cleared — always has a `was` to compare against. That is case (c) below, and it is listed.
   *
   * ⚑ So do NOT "fix" this by treating a missing key as automatically different: it would list a row
   * of empty fields for every untouched lesson, which is the whole-document noise #292 removed.
   */
  it('(a) a row with nothing stored: predicts nothing, and nothing meaningful moves', () => {
    const base = { id: 1, lessons: [{ id: 'L1' }] }
    const capture: CaptureMap = { 'lesson:L1': { overview: '' } }
    expect(projectCapture(base), 'precondition: the sparse map omits the key').not.toHaveProperty(
      'lesson:L1',
    )

    expect(captureDiff(projectCapture(base), capture)).toEqual({})
    const { doc: after } = applyCapture(base, capture)
    const lesson = (after.lessons as Record<string, unknown>[])[0]!
    expect(lesson.overview ?? '', 'undefined and "" are both empty — nothing a reader sees').toBe(
      '',
    )
  })

  it('(b) a row not in the document at all: the restore drops it', () => {
    const base = { id: 1, lessons: [{ id: 'OTHER', overview: 'untouched' }] }
    const capture: CaptureMap = { 'lesson:L1': { overview: '' } }

    expect(captureDiff(projectCapture(base), capture)).toEqual({})
    const { report } = applyCapture(base, capture)
    expect(report.applied, 'nothing is written').toBe(0)
    expect(report.droppedKeys).toContain('lesson:L1')
  })

  it('(c) but a row that DOES hold prose is always compared, and its clearing is listed', () => {
    // The shape the concern was really about. It has a saved entry, so it never takes the path above.
    const base = { id: 1, lessons: [{ id: 'L1', overview: 'a real paragraph' }] }
    const capture: CaptureMap = { 'lesson:L1': { overview: '' } }

    expect(captureDiff(projectCapture(base), capture)['lesson:L1']).toEqual({
      overview: { was: 'a real paragraph', now: '' },
    })
    const { doc: after } = applyCapture(base, capture)
    expect((after.lessons as Record<string, unknown>[])[0]!.overview).toBe('')
  })
})

describe('where the preview deliberately reports MORE than the restore writes', () => {
  it('predicts a non-whitelisted field that applyCapture will not touch', () => {
    // ⚑ `applyCapture` restricts each scope to its prose whitelist; `captureDiff` does not. Verified
    // 2026-08-23: the preview predicts `resourceLinks`, the overlay applies nothing and leaves the
    // system-owned value intact. Unreachable through a capture this app mints — `projectCapture` uses
    // the same whitelists — but pinned so the asymmetry is a decision on the record rather than a
    // surprise, and so narrowing `captureDiff` to the whitelist has to be a deliberate act that
    // fails here first. ⚑ Do NOT "fix" this by filtering: retired fields are the likeliest content of
    // a schema-mismatched capture, and that path exists so they can be read and copied out.
    const base = doc('saved text', 'untouched') as ReturnType<typeof doc> & {
      lessons: Record<string, unknown>[]
    }
    base.lessons[0]!.resourceLinks = 'system-owned'
    const capture: CaptureMap = { 'lesson:L1': { resourceLinks: 'preview-only' } }

    expect(captureDiff(projectCapture(base), capture)['lesson:L1']).toEqual({
      resourceLinks: { was: '', now: 'preview-only' },
    })
    const { doc: after, report } = applyCapture(base, capture)
    expect(report.applied, 'the overlay writes nothing').toBe(0)
    expect((after.lessons as Record<string, unknown>[])[0]!.resourceLinks).toBe('system-owned')
  })
})
