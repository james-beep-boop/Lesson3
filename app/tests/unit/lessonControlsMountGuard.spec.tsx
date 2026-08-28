// @vitest-environment jsdom
/**
 * LessonControls mount guard (2026-07-29): at 640px or narrower, a `?edit=1` deep link must NOT drop
 * the caller into edit mode. The SSR pin (lessonControlsSsr.spec.tsx) proves the server/first-paint
 * markup honours `?edit=1` — deliberately the OPPOSITE of what we want on a phone — so the neutralise
 * step is a post-mount effect and can only be observed by actually mounting and running effects.
 * This is the integration seam the pure `editingAvailableAtWidth` unit test cannot reach: that the
 * component wires the predicate to `window.innerWidth` on mount and flips itself back to view mode.
 *
 * Runs a real client mount in jsdom (see the docblock); DB-free, part of `test:unit`.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  search: 'edit=1',
  // Captured so we can assert the form's locked/unlocked state after the guard settles.
  setDisabled: vi.fn(),
  dispatchFields: vi.fn(),
  fields: {} as Record<string, unknown>,
  initializing: false,
  // A teacher with editing access for the document's subject-grade — the baseline where the edit lifecycle is offered.
  user: { id: 1, roles: [], assignments: [{ subjectGrade: 5, role: 'editor' }] } as unknown,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, disabled, onClick }: React.ComponentProps<'button'>) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  useAllFormFields: () => [mocks.fields],
  useAuth: () => ({ user: mocks.user }),
  useDocumentInfo: () => ({
    id: 1,
    savedDocumentData: {
      lessonPlan: 2,
      subjectGrade: 5,
      title: 'BIOLOGY GRADE 10: CELL STRUCTURE',
    },
  }),
  useForm: () => ({
    dispatchFields: mocks.dispatchFields,
    initializing: mocks.initializing,
    setDisabled: mocks.setDisabled,
    reset: vi.fn(),
    setModified: vi.fn(),
  }),
  useFormModified: () => false,
}))

vi.mock('payload/shared', () => ({ reduceFieldsToValues: () => ({}) }))

import LessonControls from '@/components/LessonControls'

/** jsdom's `innerWidth` is a getter — redefine it so the mount guard reads our width. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

beforeEach(() => {
  mocks.setDisabled.mockClear()
  mocks.dispatchFields.mockClear()
  mocks.fields = {}
  mocks.initializing = false
  // The pristine-official probe fires on mount (id + lessonPlan are set); keep it from throwing.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false }) as unknown as Promise<Response>),
  )
  // The nested EditJumpNav observes the body on mount; jsdom ships no ResizeObserver.
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LessonControls neutralises ?edit=1 on mount at a narrow viewport', () => {
  it('collapses loaded array rows once, then leaves in-session toggles alone', () => {
    vi.useFakeTimers()
    mocks.search = ''
    mocks.fields = {
      lessons: { rows: [{ id: 'lesson-1', collapsed: false }] },
      'lessons.0.framework': { rows: [{ id: 'phase-1', collapsed: false }] },
    }
    setViewportWidth(1280)

    render(<LessonControls />)
    act(() => vi.advanceTimersByTime(300))

    expect(mocks.dispatchFields.mock.calls.map(([action]) => action)).toEqual([
      {
        path: 'lessons',
        type: 'SET_ALL_ROWS_COLLAPSED',
        updatedRows: [{ id: 'lesson-1', collapsed: true }],
      },
      {
        path: 'lessons.0.framework',
        type: 'SET_ALL_ROWS_COLLAPSED',
        updatedRows: [{ id: 'phase-1', collapsed: true }],
      },
    ])

    // A state change later in the visit must not re-apply the opening rule over the user's choice.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(mocks.dispatchFields).toHaveBeenCalledTimes(2)
  })

  it('waits for Payload form initialization before overriding saved row preferences', () => {
    vi.useFakeTimers()
    mocks.search = ''
    mocks.initializing = true
    mocks.fields = {
      lessons: { rows: [{ id: 'lesson-1', collapsed: false }] },
    }
    setViewportWidth(1280)

    const { rerender } = render(<LessonControls />)
    expect(mocks.dispatchFields).not.toHaveBeenCalled()

    mocks.initializing = false
    rerender(<LessonControls />)
    act(() => vi.advanceTimersByTime(300))

    expect(mocks.dispatchFields).toHaveBeenCalledWith({
      path: 'lessons',
      type: 'SET_ALL_ROWS_COLLAPSED',
      updatedRows: [{ id: 'lesson-1', collapsed: true }],
    })
  })

  it('at 390px, a ?edit=1 load settles in VIEW mode (Edit shown, no Save; form disabled)', () => {
    mocks.search = 'edit=1'
    setViewportWidth(390)

    render(<LessonControls />)

    // The guard fired: edit intent was dropped, so the bar shows the view-mode lifecycle.
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    // …and the form ends locked. setDisabled(true) is the last word after editing flips back.
    expect(mocks.setDisabled.mock.calls.at(-1)?.[0]).toBe(true)

    // The read-only affordances the caller can still use are untouched.
    expect(screen.getByRole('button', { name: 'Quick preview ↗' })).toBeTruthy()
    expect(screen.getByText('Editing help')).toBeTruthy()
    // No standing notice any more (PR B): the bar carries no permanent explanation, because the
    // explanation now arrives on demand — see the press-time test below.
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('at 390px, pressing Edit explains instead of unlocking — and nothing is shown until it is pressed', () => {
    mocks.search = ''
    setViewportWidth(390)

    render(<LessonControls />)

    // Nothing occupies the bar before the press. This is the point of the change: the old notice
    // stood permanently and was what competed for space at narrow widths (#165/#166/#167 each fixed
    // an overlap it caused).
    expect(screen.queryByText(/wider screen/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    // The dialog appears, leading with what still works...
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/You can still view this lesson here/i)).toBeTruthy()
    // ...and the form did NOT unlock: Edit is still the lifecycle button, Save never appeared.
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(mocks.setDisabled.mock.calls.at(-1)?.[0]).toBe(true)

    // Dismissing returns the bar to exactly where it was.
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('at 1280px, pressing Edit unlocks the form and opens no dialog', () => {
    mocks.search = ''
    setViewportWidth(1280)

    render(<LessonControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('at 1280px, the SAME ?edit=1 load stays in EDIT mode (Save shown, no Edit; form enabled)', () => {
    mocks.search = 'edit=1'
    setViewportWidth(1280)

    render(<LessonControls />)

    // The guard is width-conditional — on a wide viewport it must not touch edit intent.
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(mocks.setDisabled.mock.calls.at(-1)?.[0]).toBe(false)
  })

  it('does NOT cancel an edit already underway when the viewport is later narrowed', () => {
    mocks.search = 'edit=1'
    setViewportWidth(1280)
    render(<LessonControls />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy() // mounted editing

    // The user drags the window below 640px mid-edit. The guard evaluated once on mount and adds no
    // resize listener, so edit mode must survive — yanking someone out mid-sentence and discarding
    // their edits would be worse than the inconsistency it fixes.
    setViewportWidth(390)
    act(() => window.dispatchEvent(new Event('resize')))

    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(mocks.setDisabled.mock.calls.at(-1)?.[0]).toBe(false)
  })
})
