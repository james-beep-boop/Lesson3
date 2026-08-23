// @vitest-environment jsdom
/**
 * WHICH VERSION AM I ON? (operator report 2026-08-23.)
 *
 * ⚑ THE TITLE DOES NOT IDENTIFY A VERSION — every version of a plan carries the same one. So the
 * control bar read `Viewing: Biology Grade 10: Cell Structure · Not Official` for any of a dozen
 * versions, and the Delete confirmation said `Delete this version (“Biology Grade 10: Cell
 * Structure”)?` — naming the one attribute that is identical across every candidate it could have
 * been. It looked like a dialog that told you what you were about to destroy.
 *
 * `semver` is the only thing that distinguishes them. This pins it in the three places it has to
 * appear, and each assertion is written so it fails if the version disappears from THAT surface
 * rather than passing on the strength of another:
 *   1. the header, in BOTH view and edit mode — the question is live whenever the bar is on screen;
 *   2. the Delete confirmation, which is the last line of defence before an unrecoverable action;
 *   3. the save-as-new confirmation, which also deletes the version being edited.
 *
 * Deliberately NOT the Delete button's label (operator decision): that row already carries six
 * buttons and is tightest at narrow widths, and the header covers every moment the button does not.
 *
 * Real client mount in jsdom; DB-free, part of `test:unit`.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  /** Overridable per test — the point of several cases is a MISSING semver. */
  semver: '1.2.0' as string | undefined,
  confirm: vi.fn((_message?: string) => false),
  /** `edit=1` puts the bar in edit mode, where Save (and its own confirmation) exists. */
  search: '' as string,
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
      semver: mocks.semver,
      // The mock user AUTHORED this version. `canDeleteVersionDoc` lets a teacher with editing
      // access delete only their own candidate, so without this the Delete button never renders and
      // the confirmation cases below would silently test nothing.
      author: 1,
    },
  }),
  useForm: () => ({ setDisabled: vi.fn(), reset: vi.fn(), setModified: vi.fn() }),
  // Save is `disabled={saving || !modified}`, so an unmodified form makes the click a no-op and the
  // confirmation is never reached. A caller pressing Save has changes; say so.
  useFormModified: () => true,
}))

vi.mock('payload/shared', () => ({ reduceFieldsToValues: () => ({}) }))

import LessonControls from '@/components/LessonControls'

/**
 * The Delete button only renders for a version the caller may delete, which needs the plan's
 * Official pointer to come back as SOMETHING ELSE (`sourceIsOfficial === false`). The component
 * probes for it on mount, so the stub answers with a different official id.
 */
const stubPointerProbe = (officialVersionId: number | null) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ officialVersion: officialVersionId }),
        }) as unknown as Promise<Response>,
    ),
  )

/** The mount guard drops `?edit=1` at ≤640px, so edit-mode cases need a desktop width. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

beforeEach(() => {
  mocks.semver = '1.2.0'
  mocks.search = ''
  mocks.confirm = vi.fn((_message?: string) => false)
  setViewportWidth(1280)
  vi.stubGlobal('confirm', mocks.confirm)
  stubPointerProbe(99) // 99 !== the doc's id (1), so this version is a deletable candidate
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

describe('the control bar says which version you are on', () => {
  it('shows the version in the header', () => {
    render(<LessonControls />)
    expect(screen.getByText('v1.2.0')).toBeTruthy()
  })

  it('shows it beside the title, not only where Delete happens to be', () => {
    // The header is the answer to the BROAD question: it is on screen in view mode, in edit mode,
    // and for a version nobody may delete. Asserting the title is present too keeps this from
    // passing on a bar that lost the title instead.
    render(<LessonControls />)
    expect(screen.getByText(/Biology Grade 10: Cell Structure/)).toBeTruthy()
    expect(screen.getByText('v1.2.0')).toBeTruthy()
  })

  it('omits the version chip rather than inventing one when the semver is unknown', () => {
    mocks.semver = undefined
    render(<LessonControls />)
    expect(screen.queryByText(/^v/)).toBeNull()
    // …and the bar still renders: a missing semver must not cost the caller their controls.
    expect(screen.getByText(/Biology Grade 10: Cell Structure/)).toBeTruthy()
  })
})

describe('the destructive confirmations name the version', () => {
  const clickAndReadConfirm = (name: string): string => {
    fireEvent.click(screen.getByRole('button', { name }))
    const text = mocks.confirm.mock.calls.at(-1)?.[0]
    expect(text, `${name} must ask for confirmation before acting`).toBeTruthy()
    return String(text)
  }

  it('Delete leads with the version, and keeps the title as secondary context', async () => {
    render(<LessonControls />)
    // The pointer probe resolves in an effect; wait for the button it gates.
    const del = await screen.findByRole('button', { name: 'Delete' })
    expect(del).toBeTruthy()

    const text = clickAndReadConfirm('Delete')
    expect(text).toContain('version 1.2.0')
    expect(text).toContain('Biology Grade 10: Cell Structure')
    expect(text).toContain('cannot be undone')
    // ⚑ The defect this replaces: the title alone, which every version shares.
    expect(text).not.toMatch(/^Delete this version/)
  })

  it('Delete falls back to "this version" when the semver is unknown', async () => {
    mocks.semver = undefined
    render(<LessonControls />)
    await screen.findByRole('button', { name: 'Delete' })

    expect(clickAndReadConfirm('Delete')).toContain('this version')
  })

  it('Save-as-new names the version it is about to delete', async () => {
    // The other destructive path: saving edits can ALSO delete the version being edited, and its
    // prompt said only "delete the one you are editing?" — leaving the caller to remember which.
    //
    // ⚑ Goes through view → Edit → Save rather than deep-linking `?edit=1`. The offer to delete the
    // source is gated on the plan's Official pointer, which arrives asynchronously; Save renders
    // immediately, so a test that clicked it straight away raced the probe, `canDelete` was still
    // false, and the confirmation was SHORT-CIRCUITED — the assertion failed for the right reason.
    // Waiting for the Delete button first is what proves the pointer has landed.
    render(<LessonControls />)
    await screen.findByRole('button', { name: 'Delete' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const text = clickAndReadConfirm('Save')
    expect(text).toContain('version 1.2.0')
    expect(text).not.toContain('the one you are editing')
  })

  it('a cancelled Delete confirmation performs no request', async () => {
    render(<LessonControls />)
    await screen.findByRole('button', { name: 'Delete' })
    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    clickAndReadConfirm('Delete') // the stub returns false — the caller said no

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })
})
