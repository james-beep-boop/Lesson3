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

// `user` is the signed-in caller; the document under edit belongs to subject-grade SG. A teacher with editing access
// grant for SG is the baseline — without one the bar offers no edit lifecycle at all (see the
// permission block at the bottom), which is the 2026-07-28 change these first cases sit on top of.
const SG = 5
const mocks = vi.hoisted(() => ({
  search: '',
  modified: false,
  user: { id: 1, roles: [], assignments: [{ subjectGrade: 5, role: 'editor' }] } as unknown,
}))

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
  useAuth: () => ({ user: mocks.user }),
  useDocumentInfo: () => ({
    id: 1,
    savedDocumentData: {
      lessonPlan: 2,
      subjectGrade: 5,
      title: 'BIOLOGY GRADE 10: CELL STRUCTURE',
    },
  }),
  useForm: () => ({ setDisabled: vi.fn(), reset: vi.fn(), setModified: vi.fn() }),
  useFormModified: () => mocks.modified,
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
    expect(html).toContain('Quick preview ↗')
    expect(html).toContain('Formatted PDF ↗')
    expect(html).toContain('Editing help')
    expect(html).toContain('<span aria-hidden="true">←</span>Back')
    expect(html).toContain('class="btn"')
    expect(html).toContain('aria-label="Back to lesson"')
  })

  // Pristine-form Save gate (2026-07-17): an untouched form has nothing to save, so Save renders
  // DISABLED until the form reports modified. (The identical-content 400 in save-as-new is the
  // authoritative server backstop; this pins the client half.)
  it('renders Save disabled while the form is pristine, enabled once modified', () => {
    mocks.search = 'edit=1'
    mocks.modified = false
    expect(renderToString(<LessonControls />)).toMatch(/<button[^>]*disabled[^>]*>Save<\/button>/)
    mocks.modified = true
    expect(renderToString(<LessonControls />)).not.toMatch(
      /<button[^>]*disabled[^>]*>Save<\/button>/,
    )
    mocks.modified = false
  })
})

/**
 * The edit lifecycle is offered only to a caller who may actually edit THIS version (2026-07-28).
 * Field-level access already locked the form for everyone else, so the old unconditional Edit button
 * was not a security hole — it was a dead end: on the Rock a Biology editor opening a Chemistry plan
 * could press Edit, get Save/Cancel, and find all 23 sampled fields still disabled. The client now
 * mirrors the server's own `isEditorFor`, so the bar cannot offer what the form will refuse.
 */
describe('LessonControls offers the edit lifecycle only to someone who may edit this version', () => {
  const OUT_OF_SCOPE = { id: 1, roles: [], assignments: [{ subjectGrade: SG + 1, role: 'editor' }] }

  it('renders no Edit button for an editor scoped to a DIFFERENT subject-grade', () => {
    mocks.search = ''
    mocks.user = OUT_OF_SCOPE
    const html = renderToString(<LessonControls />)
    expect(html).not.toMatch(/<button[^>]*>Edit<\/button>/)
    expect(html).not.toMatch(/<button[^>]*>Save<\/button>/)
    expect(html).toContain('Viewing:')
    // The read-only affordances they came for must survive.
    expect(html).toMatch(/<button[^>]*>Quick preview ↗<\/button>/)
    expect(html).not.toContain('Editing help')
  })

  // The deep link is an INTENT, not an authorisation — `?edit=1` must not unlock a form the caller
  // may not edit. Pinned because the intent is read during SSR, before `canEdit` could be re-checked.
  it('ignores the ?edit=1 deep link for a caller who may not edit', () => {
    mocks.search = 'edit=1'
    mocks.user = OUT_OF_SCOPE
    const html = renderToString(<LessonControls />)
    expect(html).not.toContain('lesson-controls-wrap--editing')
    expect(html).toContain('Viewing:')
    expect(html).not.toMatch(/<button[^>]*>Save<\/button>/)
  })

  it('renders no Edit button for a Teacher (authenticated, no grant at all)', () => {
    mocks.search = ''
    mocks.user = { id: 1, roles: [], assignments: [] }
    expect(renderToString(<LessonControls />)).not.toMatch(/<button[^>]*>Edit<\/button>/)
  })

  it('still offers Edit to a Site Administrator, who is scoped to nothing and allowed everything', () => {
    mocks.search = ''
    mocks.user = { id: 1, roles: ['siteAdmin'], assignments: [] }
    expect(renderToString(<LessonControls />)).toMatch(/<button[^>]*>Edit<\/button>/)
  })

  it('still offers Edit to a Subject Administrator for THIS subject-grade', () => {
    mocks.search = ''
    mocks.user = { id: 1, roles: [], assignments: [{ subjectGrade: SG, role: 'subjectAdmin' }] }
    expect(renderToString(<LessonControls />)).toMatch(/<button[^>]*>Edit<\/button>/)
  })
})
