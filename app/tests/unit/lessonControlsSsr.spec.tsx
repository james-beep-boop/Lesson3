/**
 * LessonControls SSR/hydration pin (fix 2026-07-05): the `?edit=1` edit-intent deep link must
 * produce the SAME initial render on the server as on the client. The original code gated the
 * initial `editing` state on `typeof window !== 'undefined'` + window.location.search, so the
 * server always rendered the locked bar (notice + enabled Edit) while a `?edit=1` client rendered
 * unlocked — a hydration mismatch (React #418) on every load of the lesson page's "Edit" deep link.
 * The state now derives from useSearchParams (SSR-consistent on the per-request admin route).
 *
 * Runs in the default NODE environment (no `window`, like the real server pass) and renders via
 * react-dom/server: with `?edit=1` the SERVER markup must already be unlocked; without it, locked.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

const mocks = vi.hoisted(() => ({ search: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

// The component only needs enough of the admin form context to render its bar: a saved document
// with an id, a no-op form API, and a Button that surfaces `disabled`.
vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, disabled, onClick }: React.ComponentProps<'button'>) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  useAllFormFields: () => [{}],
  useAuth: () => ({ user: null }),
  useDocumentInfo: () => ({
    id: 1,
    savedDocumentData: { lessonPlan: 2, title: 'BIOLOGY GRADE 10: CELL STRUCTURE' },
  }),
  useForm: () => ({ setDisabled: vi.fn(), reset: vi.fn(), setModified: vi.fn() }),
}))

vi.mock('payload/shared', () => ({ reduceFieldsToValues: () => ({}) }))

import LessonControls from '@/components/LessonControls'

describe('LessonControls server render honours the ?edit=1 intent (hydration-consistent)', () => {
  // Since the D3 regroup the edit-lifecycle group SWAPS with the mode (no disabled lifecycle
  // buttons): unlocked shows Save/Cancel and no Edit; locked shows Edit and no Save. The mode
  // signal (declutter 2026-07-15) is the bold Editing:/Viewing: title prefix plus the wrap's
  // --editing modifier, which gates the role-lock "read-only" label chips in custom.scss.
  it('renders UNLOCKED on the server when the URL carries edit=1', () => {
    mocks.search = 'edit=1'
    const html = renderToString(<LessonControls />)
    expect(html).toContain('lesson-controls-wrap--editing')
    expect(html).toContain('Editing:')
    expect(html).toMatch(/<button[^>]*>Save<\/button>/)
    expect(html).toMatch(/<button[^>]*>Cancel<\/button>/)
    expect(html).not.toMatch(/<button[^>]*>Edit<\/button>/)
  })

  it('renders LOCKED on the server without the edit intent', () => {
    mocks.search = ''
    const html = renderToString(<LessonControls />)
    expect(html).not.toContain('lesson-controls-wrap--editing')
    expect(html).toContain('Viewing:')
    expect(html).toMatch(/<button[^>]*>Edit<\/button>/)
    expect(html).not.toMatch(/<button[^>]*>Save<\/button>/)
  })
})
