/**
 * How the restore prompt groups what it found.
 *
 * ⚑ The grouping is the substance of that panel: it is what turns a map keyed on row UUIDs into
 * something a teacher can recognise while deciding whether to take their work back. Tested here
 * rather than through a render, because a render would exercise JSX and mocks instead of the rules.
 */
import { describe, expect, it } from 'vitest'

import { groupsOf } from '../../src/components/EditRecovery/restoreGroups'
import type { OfferedCapture } from '../../src/components/EditRecovery/protocol'

const capture = (content: OfferedCapture['content']): OfferedCapture => ({
  content,
  capturedAt: '2026-08-07T12:00:00.000Z',
  baseUpdatedAt: '2026-08-07T00:00:00.000Z',
  schemaVersion: 'sv-1',
  stale: false,
  schemaMismatch: false,
})

describe('grouping the offered prose', () => {
  it('puts a lesson’s three key-scopes under ONE heading, in anchor order', () => {
    const groups = groupsOf(
      capture({
        'slo:L1': { knowledge: 'names the organelles' },
        'lesson:L1': { overview: 'down the microscope' },
      }),
      [
        { key: 'lesson:L1', heading: 'Lesson 1' },
        { key: 'slo:L1', heading: 'Lesson 1' },
      ],
      {},
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].heading).toBe('Lesson 1')
    // Anchor order, NOT the map's — the map arrives from JSONB, which reorders keys.
    expect(groups[0].lines.map((l) => l.field)).toEqual(['Overview', 'Knowledge'])
  })

  it('uses the authored field labels, not a de-camelised guess', () => {
    const groups = groupsOf(
      capture({ 'slo:L1': { keyInquiry: 'why do cells differ?' } }),
      [{ key: 'slo:L1', heading: 'Lesson 1' }],
      {},
    )
    expect(groups[0].lines[0].field).toBe('Key inquiry question')
  })

  it('omits a field whose captured value matches what is stored, whitespace included', () => {
    const groups = groupsOf(
      capture({ 'lesson:L1': { overview: '   ', title: 'kept', teacherReflection: null } }),
      [{ key: 'lesson:L1', heading: 'Lesson 1' }],
      { 'lesson:L1': { overview: '   ', title: null, teacherReflection: null } },
    )
    expect(groups[0].lines.map((l) => l.field)).toEqual(['Title'])
  })

  it('but DOES list a whitespace-only value that differs, because the restore writes it', () => {
    // ⚑ This case used to be filtered out as "nothing to read", and that filter is what hid a
    // CLEARED field too — the two are the same test. `captureDiff` compares literally instead: three
    // spaces really would be written over an empty field. Invisible to a reader and rare, and the
    // alternative (normalising whitespace before comparing) would hide an edit that only adds or
    // removes a paragraph break, which the editor's grammar makes meaningful.
    const groups = groupsOf(
      capture({ 'lesson:L1': { overview: '   ' } }),
      [{ key: 'lesson:L1', heading: 'Lesson 1' }],
      { 'lesson:L1': { overview: null } },
    )
    expect(groups[0]!.lines).toEqual([{ field: 'Overview', was: '', now: '   ' }])
  })

  /**
   * ⚑ THE DEFECT THIS FILE WAS WRITTEN FOR. Groups were merged by HEADING, which looked equivalent
   * because `lesson:`/`slo:`/`prompt:` share a heading *by sharing a row id*. Two DELETED lessons
   * break that: `orphanHeading` returns the same string for both, so their prose interleaved under
   * one title and every field they had in common collided on React's `key`.
   */
  it('keeps two DIFFERENT orphaned rows in different groups', () => {
    const groups = groupsOf(
      capture({
        'lesson:gone-a': { overview: 'from the first deleted lesson' },
        'lesson:gone-b': { overview: 'from the second deleted lesson' },
      }),
      [], // the live plan has neither row any more
      {},
    )

    expect(groups, 'two deleted lessons are two things, not one').toHaveLength(2)
    expect(new Set(groups.map((g) => g.id)).size, 'and their keys must differ').toBe(2)
    expect(groups[0].lines).toHaveLength(1)
    expect(groups[1].lines).toHaveLength(1)
  })

  it('names an orphaned row as gone rather than inventing a number for it', () => {
    const groups = groupsOf(capture({ 'lesson:gone': { overview: 'orphaned' } }), [], {})
    expect(groups[0].heading).toBe('A lesson that is no longer in this plan')
    expect(groups[0].heading).not.toMatch(/\d/)
  })

  it('is empty when nothing readable survives', () => {
    expect(groupsOf(capture({}), [], {})).toEqual([])
    expect(groupsOf(capture(null), [], {})).toEqual([])
  })
})

describe('listing only what DIFFERS from the saved version', () => {
  /**
   * ⚑ THE DEFECT THIS PINS. A capture is a FULL snapshot — `projectCapture` walks the document and
   * never diffs — so an unfiltered list rendered the entire lesson plan, burying the handful of
   * fields the teacher actually changed among dozens they did not. Operator decision 2026-08-23:
   * never show the whole document; nothing at all is better.
   */
  const anchors = [{ key: 'lesson:L1', heading: 'Lesson 1' }]

  it('omits fields whose captured text matches what is stored', () => {
    const groups = groupsOf(
      capture({ 'lesson:L1': { overview: 'edited', teacherReflection: 'untouched' } }),
      anchors,
      { 'lesson:L1': { overview: 'original', teacherReflection: 'untouched' } },
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.lines).toEqual([{ field: 'Overview', was: 'original', now: 'edited' }])
  })

  it('lists NOTHING when the capture matches the saved version entirely', () => {
    // The blank panel is the intended outcome — the alternative was the whole plan.
    const groups = groupsOf(
      capture({ 'lesson:L1': { overview: 'same', teacherReflection: 'same' } }),
      anchors,
      { 'lesson:L1': { overview: 'same', teacherReflection: 'same' } },
    )
    expect(groups).toEqual([])
  })

  it('treats a row the saved version does not have as entirely new', () => {
    // A lesson added during the session: nothing to compare against, so all of it differs.
    const groups = groupsOf(capture({ 'lesson:L9': { overview: 'brand new' } }), [], {})
    // ⚑ `was: ''` is what makes the panel render the whole value as an addition rather than as a
    // change from nothing-in-particular. `unifiedDiff('' , v)` annotates all of `v`.
    expect(groups[0]!.lines).toEqual([{ field: 'Overview', was: '', now: 'brand new' }])
  })

  it('does not read a stored null and a captured empty string as a change', () => {
    // Both mean "empty". Without the `?? ''` normalisation this reported a change on every field the
    // teacher had never filled in — which is most of them on a fresh plan.
    const groups = groupsOf(
      capture({ 'lesson:L1': { overview: 'real edit', teacherReflection: '' } }),
      anchors,
      { 'lesson:L1': { overview: 'was', teacherReflection: null } },
    )
    expect(groups[0]!.lines).toEqual([{ field: 'Overview', was: 'was', now: 'real edit' }])
  })

  it('normalises a stored null on the WAS side, so the diff has a string to work with', () => {
    // ⚑ `was` feeds straight into `unifiedDiff`, which takes two strings. A `null` reaching it would
    // diff the text "null" against the prose — the field would render as though the teacher had
    // replaced the word null, which is nonsense a reader cannot un-see.
    const groups = groupsOf(capture({ 'lesson:L1': { overview: 'filled in at last' } }), anchors, {
      'lesson:L1': { overview: null },
    })
    expect(groups[0]!.lines).toEqual([{ field: 'Overview', was: '', now: 'filled in at last' }])
  })

  /**
   * ⚑ A CLEARED field is the most consequential change a restore can make, and was the one the panel
   * would not show. The full story — why the filter that hid it was correct when written, and why
   * #292 falsified its premise — is on `captureDiff` in `projection.ts`, which now owns the rule;
   * `captureDiffAgreement.spec.ts` pins it against the real `applyCapture`. These cases pin what the
   * PANEL does with the answer.
   */
  it('LISTS a field the restore would CLEAR, rather than hiding it', () => {
    const groups = groupsOf(capture({ 'lesson:L1': { overview: '' } }), anchors, {
      'lesson:L1': { overview: 'a paragraph the teacher would lose' },
    })
    expect(groups[0]!.lines).toEqual([
      { field: 'Overview', was: 'a paragraph the teacher would lose', now: '' },
    ])
  })

  it('treats a captured NULL as the same clearing, because the overlay does', () => {
    // `ProseValue` is `string | null` and `overlay` applies either — so both must be listed.
    const groups = groupsOf(capture({ 'lesson:L1': { overview: null } }), anchors, {
      'lesson:L1': { overview: 'also about to be lost' },
    })
    expect(groups[0]!.lines).toEqual([{ field: 'Overview', was: 'also about to be lost', now: '' }])
  })

  it('still says nothing when an empty capture matches an empty saved value', () => {
    // Empty→empty is not a change, and most fields on a fresh plan are empty. Without this the
    // panel would list the whole plan again, which is the defect #292 existed to fix.
    const groups = groupsOf(
      capture({ 'lesson:L1': { overview: '', teacherReflection: null } }),
      anchors,
      { 'lesson:L1': { overview: null, teacherReflection: '' } },
    )
    expect(groups).toEqual([])
  })

  it('is a REQUIRED argument now, so "forgot to pass saved" cannot happen', () => {
    // ⚑ This replaces a test that pinned the old optional-parameter behaviour ("an omitted `saved`
    // must not silently blank the panel"). The parameter is required, so the type system makes that
    // mistake impossible and the runtime guard is gone. Kept as a one-line reminder of WHY the
    // optional form was removed: it was a second, contradictory answer to "does an empty value
    // count", alive only for callers that never existed.
    expect(groupsOf.length, 'groupsOf takes capture, anchors and saved').toBe(3)
  })
})
