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
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].heading).toBe('Lesson 1')
    // Anchor order, NOT the map's — the map arrives from JSONB, which reorders keys.
    expect(groups[0].lines.map((l) => l.field)).toEqual(['Overview', 'Knowledge'])
  })

  it('uses the authored field labels, not a de-camelised guess', () => {
    const groups = groupsOf(capture({ 'slo:L1': { keyInquiry: 'why do cells differ?' } }), [
      { key: 'slo:L1', heading: 'Lesson 1' },
    ])
    expect(groups[0].lines[0].field).toBe('Key inquiry question')
  })

  it('lists only fields that have something to read', () => {
    const groups = groupsOf(
      capture({ 'lesson:L1': { overview: '   ', title: 'kept', teacherReflection: null } }),
      [{ key: 'lesson:L1', heading: 'Lesson 1' }],
    )
    expect(groups[0].lines.map((l) => l.field)).toEqual(['Title'])
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
    )

    expect(groups, 'two deleted lessons are two things, not one').toHaveLength(2)
    expect(new Set(groups.map((g) => g.id)).size, 'and their keys must differ').toBe(2)
    expect(groups[0].lines).toHaveLength(1)
    expect(groups[1].lines).toHaveLength(1)
  })

  it('names an orphaned row as gone rather than inventing a number for it', () => {
    const groups = groupsOf(capture({ 'lesson:gone': { overview: 'orphaned' } }), [])
    expect(groups[0].heading).toBe('A lesson that is no longer in this plan')
    expect(groups[0].heading).not.toMatch(/\d/)
  })

  it('is empty when nothing readable survives', () => {
    expect(groupsOf(capture({}), [])).toEqual([])
    expect(groupsOf(capture(null), [])).toEqual([])
  })
})
