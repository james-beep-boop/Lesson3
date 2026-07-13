/**
 * EditJumpNav (2026-07-13) builds its jump chips from Payload form state. This pins that parsing:
 * one chip per top-level `lessons.<i>` row (with its number + title in the tooltip), the fixed
 * Top / Final explanation / Summary table links, and that the nested `summaryTable.lessons.*`
 * array is NOT mistaken for a lesson. Scroll behaviour is DOM-driven and covered by the in-browser
 * verification, not here (renderToString runs no effects).
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  lesson: '' as string,
  fields: {} as Record<string, { value: unknown }>,
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.lesson ? `lesson=${mocks.lesson}` : ''),
}))
vi.mock('@payloadcms/ui', () => ({ useAllFormFields: () => [mocks.fields] }))

import EditJumpNav from '@/components/LessonControls/EditJumpNav'

describe('EditJumpNav derives its chips from form state', () => {
  it('renders a chip per lesson (number + title tooltip) plus the fixed links', () => {
    mocks.fields = {
      title: { value: 'Plant transport' },
      'lessons.0.number': { value: 1 },
      'lessons.0.title': { value: 'Cells' },
      'lessons.1.number': { value: 2 },
      'lessons.1.title': { value: 'Osmosis' },
      // The Summary Table's own nested lessons array must NOT be counted as lesson rows.
      'summaryTable.lessons.0.observed': { value: 'y' },
    }
    const html = renderToString(<EditJumpNav />)

    expect(html).toContain('>Top</button>')
    expect(html).toContain('>Final explanation</button>')
    expect(html).toContain('>Summary table</button>')
    expect((html.match(/lesson-controls__nav-chip/g) ?? []).length).toBe(2)
    expect(html).toContain('Lesson 1: Cells')
    expect(html).toContain('Lesson 2: Osmosis')
  })

  it('falls back to the row position when a lesson number is not loaded', () => {
    mocks.fields = { 'lessons.0.title': { value: 'Untitled row' } }
    const html = renderToString(<EditJumpNav />)
    // number missing → chip shows position 1, tooltip carries the title.
    expect(html).toContain('Lesson 1: Untitled row')
  })

  it('renders nothing when the form has no lessons', () => {
    mocks.fields = { title: { value: 'x' } }
    expect(renderToString(<EditJumpNav />)).toBe('')
  })
})
