import { describe, it, expect } from 'vitest'

import { groupLessons } from '@/lib/substrand'
import {
  deleteScope,
  deleteScopeSentence,
  groupState,
  hiddenSelectedCount,
  strandIds,
  subjectGradeIds,
  toggleGroup,
  type SelectableRow,
} from '@/lib/planSelection'

/**
 * The invariant these cover: Manage's delete panel sends EXACTLY what its checkboxes claim. That is set
 * arithmetic, so it is tested here rather than through a browser — `tests/e2e/manage.e2e.spec.ts` is
 * left the wire delete and the search-mode rendering, which genuinely need a page.
 */

/** Override style, matching substrand.spec.ts / filterRows.spec.ts — a call site reads as its intent. */
const plan = (id: number, over: Partial<SelectableRow> = {}): SelectableRow => ({
  id,
  substrandId: '1.1',
  substrandName: `Plan ${id}`,
  strandName: S1,
  subjectName: 'Biology',
  grade: 10,
  ...over,
})

// Biology · Grade 10: strand 1 (three plans), strand 2 (one plan). Chemistry · Grade 9: one plan.
// Plus one plan with NO curriculum coordinates — a pointerless plan, as the Repair section lists.
const S1 = 'Strand 1.0: Cell Biology'
const S2 = 'Strand 2.0: Physiology'
const ROWS: SelectableRow[] = [
  plan(1, { substrandId: '1.1', substrandName: 'Cell Structure' }),
  plan(2, { substrandId: '1.2', substrandName: 'Chemicals of Life' }),
  plan(3, { substrandId: '1.3', substrandName: 'Cell Biology' }),
  plan(4, { substrandId: '2.1', substrandName: 'Plant Nutrition', strandName: S2 }),
  plan(5, { subjectName: 'Chemistry', grade: 9, strandName: 'Strand 1.0: Matter' }),
  plan(6, { substrandId: '', substrandName: 'Broken Plan', strandName: null }),
]
const GROUPS = groupLessons(ROWS)
const bio = () => GROUPS.find((g) => g.label === 'Biology · Grade 10')!

describe('group id collection', () => {
  it('gathers a strand’s plans in render order', () => {
    const strand1 = bio().strands.find((s) => s.strandNumber === 1)!
    expect(strandIds(strand1)).toEqual([1, 2, 3])
  })

  it('gathers a subject-grade’s plans across all of its strands', () => {
    // 6 is the coordinate-less plan: it lands in this subject-grade's "Other" strand, so a
    // subject-grade select must include it — a broken plan is exactly what an operator wants to clear.
    // The exact-equality assertion is also what proves the Chemistry plan (5) stays out.
    expect(subjectGradeIds(bio())).toEqual([1, 2, 3, 4, 6])
  })
})

describe('groupState', () => {
  const ids = [1, 2, 3]

  it('is none when nothing under it is selected', () => {
    expect(groupState(ids, new Set())).toBe('none')
    expect(groupState(ids, new Set([4, 5]))).toBe('none')
  })

  it('is some when only part of it is selected', () => {
    expect(groupState(ids, new Set([2]))).toBe('some')
    expect(groupState(ids, new Set([1, 3]))).toBe('some')
  })

  it('is all only when every id under it is selected', () => {
    expect(groupState(ids, new Set([1, 2, 3]))).toBe('all')
    expect(groupState(ids, new Set([1, 2, 3, 9]))).toBe('all')
  })

  it('reports an EMPTY group as none, not all', () => {
    // `every` on [] is vacuously true, which would tick a group holding nothing and offer a
    // delete of zero plans.
    expect(groupState([], new Set([1]))).toBe('none')
  })
})

describe('toggleGroup', () => {
  it('clears the group when it was already fully selected', () => {
    const ids = [1, 2, 3]
    expect([...toggleGroup(new Set([1, 2, 3, 5]), ids)]).toEqual([5])
  })

  it('FILLS a partially selected group rather than emptying it', () => {
    // Asserted as a SET, deliberately: the panel's delete loop no longer depends on this function's
    // insertion order (it records the ids it actually removed), so pinning order here would invent a
    // contract nothing needs.
    const next = toggleGroup(new Set([2]), [1, 2, 3])
    expect([...next].sort()).toEqual([1, 2, 3])
  })

  it('leaves ids outside the group untouched', () => {
    expect(toggleGroup(new Set([5]), [1, 2]).has(5)).toBe(true)
  })

  it('does not mutate the set it is given', () => {
    const before = new Set([2])
    toggleGroup(before, [1, 2, 3])
    expect([...before]).toEqual([2])
  })
})

describe('hiddenSelectedCount', () => {
  it('is zero when everything selected is on screen', () => {
    expect(hiddenSelectedCount(new Set([1, 2]), ROWS)).toBe(0)
  })

  it('counts selections the current filter hides', () => {
    const visible = ROWS.filter((r) => r.substrandName.includes('Cell'))
    expect(hiddenSelectedCount(new Set([1, 2, 4]), visible)).toBe(2) // 2 and 4 are filtered out
  })

  it('is zero for an empty selection even with nothing visible', () => {
    expect(hiddenSelectedCount(new Set(), [])).toBe(0)
  })
})

describe('deleteScope', () => {
  it('names a subject-grade when the selection is exactly one', () => {
    const scope = deleteScope(GROUPS, new Set(subjectGradeIds(bio())))
    expect(scope).toEqual({ count: 5, kind: 'subjectGrade', label: 'Biology · Grade 10' })
  })

  it('names a strand when the selection is exactly one', () => {
    const strand1 = bio().strands.find((s) => s.strandNumber === 1)!
    const scope = deleteScope(GROUPS, new Set(strandIds(strand1)))
    expect(scope.kind).toBe('strand')
    expect(scope.label).toBe('Strand 1: Cell Biology (Biology · Grade 10)')
  })

  it('names nothing for an ad-hoc selection that spans groups', () => {
    expect(deleteScope(GROUPS, new Set([1, 4, 5]))).toEqual({ count: 3, kind: null, label: null })
  })

  it('names nothing when a group is only PARTLY selected', () => {
    expect(deleteScope(GROUPS, new Set([1, 2])).kind).toBe(null)
  })

  it('never frames a single plan as a group, even as a strand’s only member', () => {
    const strand2 = bio().strands.find((s) => s.strandNumber === 2)!
    expect(strandIds(strand2)).toEqual([4])
    expect(deleteScope(GROUPS, new Set([4]))).toEqual({ count: 1, kind: null, label: null })
  })

  it('prefers the subject-grade label when its single strand fills it', () => {
    // Both id sets are identical here, so the two checks in `deleteScope` can both match; the broader
    // label is the truer description of what disappears.
    const oneStrand = groupLessons([
      plan(7, { subjectName: 'Maths', grade: 8, strandName: 'Strand 1.0: Number' }),
      plan(8, {
        subjectName: 'Maths',
        grade: 8,
        strandName: 'Strand 1.0: Number',
        substrandId: '1.2',
      }),
    ])
    expect(deleteScope(oneStrand, new Set([7, 8])).kind).toBe('subjectGrade')
  })
})

describe('deleteScopeSentence', () => {
  it('names the group and count for a whole-group delete', () => {
    expect(
      deleteScopeSentence({ count: 24, kind: 'subjectGrade', label: 'Biology · Grade 10' }),
    ).toBe(
      'Delete ALL 24 lesson plans in Biology · Grade 10, including all of their saved versions.',
    )
  })

  it('states the count alone for an ad-hoc selection', () => {
    expect(deleteScopeSentence({ count: 3, kind: null, label: null })).toBe(
      'Delete 3 lesson plans, including all of their saved versions.',
    )
  })

  it('is singular for one plan', () => {
    expect(deleteScopeSentence({ count: 1, kind: null, label: null })).toBe(
      'Delete 1 lesson plan, including all of its saved versions.',
    )
  })
})
