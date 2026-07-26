/**
 * `stripCollapsed` — the surgical half of `scripts/clear-editor-collapse-prefs.ts`. It must remove the
 * stored row-collapse state (so Payload's `isRowCollapsed` falls through to `initCollapsed`) while
 * leaving every OTHER stored preference intact. An earlier draft deleted whole preference documents;
 * these cases pin the narrower contract that replaced it.
 */
import { describe, it, expect } from 'vitest'

import { stripCollapsed } from '../../scripts/lib/stripCollapsed'

describe('stripCollapsed', () => {
  it('removes `collapsed` while preserving the rest of that field entry', () => {
    const { value, stripped } = stripCollapsed({
      fields: { lessons: { collapsed: ['a', 'b'], someOtherPref: 1 } },
    })
    expect(stripped).toEqual(['lessons'])
    expect(value).toEqual({ fields: { lessons: { someOtherPref: 1 } } })
  })

  it('preserves sibling field paths and top-level keys', () => {
    const { value, stripped } = stripCollapsed({
      fields: { lessons: { collapsed: ['a'] }, 'summaryTable.lessons': { width: 200 } },
      editViewType: 'default',
    })
    expect(stripped).toEqual(['lessons'])
    expect(value).toEqual({
      fields: { lessons: {}, 'summaryTable.lessons': { width: 200 } },
      editViewType: 'default',
    })
  })

  it('strips every path that carries collapse state', () => {
    const { stripped } = stripCollapsed({
      fields: {
        lessons: { collapsed: [] },
        'lessons.0.framework': { collapsed: ['x'] },
        'finalExplanation.rubric': { other: true },
      },
    })
    expect(stripped.sort()).toEqual(['lessons', 'lessons.0.framework'])
  })

  it('treats an EMPTY collapsed array as present — that is the whole point', () => {
    // `isRowCollapsed` gates on `collapsedPrefs !== undefined`, so an empty array still suppresses
    // `initCollapsed` and renders every row expanded. It must be stripped like any other.
    const { value, stripped } = stripCollapsed({ fields: { lessons: { collapsed: [] } } })
    expect(stripped).toEqual(['lessons'])
    expect(value).toEqual({ fields: { lessons: {} } })
  })

  it('is a no-op (same reference) when there is nothing to strip', () => {
    const input = { fields: { lessons: { width: 1 } } }
    const { value, stripped } = stripCollapsed(input)
    expect(stripped).toEqual([])
    expect(value).toBe(input) // lets the caller skip the write entirely
  })

  it('tolerates missing / malformed values', () => {
    for (const input of [undefined, null, {}, { fields: null }, 'nonsense', 42]) {
      const { stripped } = stripCollapsed(input)
      expect(stripped).toEqual([])
    }
  })

  it('does not mutate the input', () => {
    const input = { fields: { lessons: { collapsed: ['a'] } } }
    stripCollapsed(input)
    expect(input.fields.lessons.collapsed).toEqual(['a'])
  })
})
