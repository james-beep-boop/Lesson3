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
import { render, screen, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  search: 'edit=1',
  // Captured so we can assert the form's locked/unlocked state after the guard settles.
  setDisabled: vi.fn(),
  // An Editor for the document's subject-grade — the baseline where the edit lifecycle is offered.
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
  useAllFormFields: () => [{}],
  useAuth: () => ({ user: mocks.user }),
  useDocumentInfo: () => ({
    id: 1,
    savedDocumentData: {
      lessonPlan: 2,
      subjectGrade: 5,
      title: 'BIOLOGY GRADE 10: CELL STRUCTURE',
    },
  }),
  useForm: () => ({ setDisabled: mocks.setDisabled, reset: vi.fn(), setModified: vi.fn() }),
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
  // The pristine-official probe fires on mount (id + lessonPlan are set); keep it from throwing.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false }) as unknown as Promise<Response>))
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
  vi.unstubAllGlobals()
})

describe('LessonControls neutralises ?edit=1 on mount at a narrow viewport', () => {
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
    expect(screen.getByRole('note')).toBeTruthy() // the "needs a wider screen" notice
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
})
