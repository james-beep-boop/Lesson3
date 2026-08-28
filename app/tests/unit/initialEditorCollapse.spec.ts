import type { FormState } from 'payload'
import { describe, expect, it } from 'vitest'

import { initialCollapseActions } from '@/components/LessonControls/initialCollapse'

const row = (id: string, collapsed: boolean) => ({ id, collapsed })

describe('initial lesson-editor collapse', () => {
  it('waits for the required Lessons array instead of latching onto partial form state', () => {
    expect(initialCollapseActions({ title: { value: 'Plan' } } as FormState)).toBeNull()
  })

  it('collapses every array path without changing scalar fields or mutating the input', () => {
    const fields = {
      title: { value: 'Plan' },
      lessons: { rows: [row('lesson-1', false), row('lesson-2', true)] },
      'lessons.0.framework': { rows: [row('phase-1', false)] },
      'summaryTable.lessons': { rows: [row('summary-1', true)] },
    } as unknown as FormState

    expect(initialCollapseActions(fields)).toEqual([
      {
        path: 'lessons',
        type: 'SET_ALL_ROWS_COLLAPSED',
        updatedRows: [row('lesson-1', true), row('lesson-2', true)],
      },
      {
        path: 'lessons.0.framework',
        type: 'SET_ALL_ROWS_COLLAPSED',
        updatedRows: [row('phase-1', true)],
      },
    ])
    expect(fields.lessons?.rows?.[0]?.collapsed).toBe(false)
  })

  it('returns an empty action list when the ready form already starts collapsed', () => {
    const fields = {
      lessons: { rows: [row('lesson-1', true)] },
    } as unknown as FormState

    expect(initialCollapseActions(fields)).toEqual([])
  })
})
