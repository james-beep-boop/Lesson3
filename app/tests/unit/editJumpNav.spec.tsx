// @vitest-environment jsdom
/**
 * EditJumpNav (2026-07-13) builds its jump chips from Payload form state. This pins that parsing:
 * one chip per top-level `lessons.<i>` row (with its number + title in the tooltip), the fixed
 * Top / Final explanation / Summary table links, and that the nested `summaryTable.lessons.*`
 * array is NOT mistaken for a lesson.
 *
 * ⚑ AND, SINCE 2026-08-25, WHAT "TOP" ACTUALLY DOES. This file used to say "scroll behaviour is
 * DOM-driven and covered by the in-browser verification, not here" — and that sentence is exactly how
 * a regression shipped. `Top` was `jumpTo('field-title')`; #297 moved `title` into a collapsed panel
 * that teachers never render, `scrollToField` returns silently on a missing element, and the button
 * became a no-op with no error to notice. Nothing failed, because nothing looked.
 *
 * Deferring a behaviour to manual verification is a decision to have no regression test for it. The
 * environment is jsdom now so a click can be driven; `renderToString` still works here, so the
 * parsing cases below are unchanged.
 */
import React from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { render, screen, cleanup } from '@testing-library/react'

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

describe('"Top" scrolls the page, not a field', () => {
  beforeEach(() => {
    // ⚑ Only needed now that the environment is jsdom and EFFECTS RUN — `renderToString` never
    // executed them, which is part of why the click path had no coverage. The nav observes body size
    // to re-derive the active chip when Payload's lazy rendering changes the layout without a scroll.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** The nav renders nothing without lessons, so every case needs at least one row. */
  const withOneLesson = () => {
    mocks.fields = { 'lessons.0.number': { value: 1 }, 'lessons.0.title': { value: 'Cells' } }
  }

  it('scrolls to the top even when #field-title does not exist at all', () => {
    // ⚑ THE REGRESSION. A teacher's form has no `#field-title`: it lives in the plan-details panel,
    // whose `condition` is false for them, so Payload never renders it. The old implementation asked
    // for that element and returned silently when it was absent.
    withOneLesson()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    render(<EditJumpNav />)
    expect(document.getElementById('field-title'), 'precondition: the field is absent').toBeNull()

    screen.getByRole('button', { name: 'Top' }).click()

    expect(
      scrollTo,
      'Top must scroll the page regardless of which fields are rendered',
    ).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
  })

  it('scrolls instantly, not smoothly', () => {
    // A 90 000px smooth animation is disorienting and fights the field jumps' re-pinning loop.
    withOneLesson()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    render(<EditJumpNav />)
    screen.getByRole('button', { name: 'Top' }).click()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('does not reach for a field element at all', () => {
    // The stronger claim: not "it happens to work without the field" but "it never asks". A future
    // change that reintroduces a field lookup here fails, which is what stops the regression class.
    withOneLesson()
    vi.stubGlobal('scrollTo', vi.fn())
    const byId = vi.spyOn(document, 'getElementById')
    render(<EditJumpNav />)
    byId.mockClear()

    screen.getByRole('button', { name: 'Top' }).click()

    expect(byId, 'Top must not depend on any element id').not.toHaveBeenCalled()
  })
})
