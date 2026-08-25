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
 * `applyCapture` over a real document and asserts the preview predicted exactly the fields that
 * actually moved. A future edit to either side that breaks the correspondence fails HERE, which is
 * the only place that can see both.
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
  it('the preview predicts exactly the leaves the restore moves', () => {
    const base = doc(saved, 'untouched')
    const capture: CaptureMap = {
      'lesson:L1': { overview: captured as string | null, teacherReflection: 'untouched' },
    }
    expect(predicted(base, capture)).toEqual(actuallyChanged(base, capture).sort())
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
