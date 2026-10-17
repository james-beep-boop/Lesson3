// @vitest-environment jsdom
/**
 * The editor's "Keep for later" button (SPEC §5, 2026-10-17).
 *
 * `keepForLater.spec.tsx` pins the hook's verdict; this pins what the EDITOR does with it, because
 * the destructive step — resetting the form, which clears the screen — lives here:
 *
 *   B1  `kept` resets the form, leaves edit mode, and says until when the work is kept
 *   B2  `notKept` leaves the form alone: no reset, still in edit mode, and an explanation
 *   B3  an administrator is warned first that structure and answer keys are not kept, and saying
 *       no does nothing at all
 *   B4  nothing to keep (a pristine form) means the button is disabled
 *   B5  the form is locked while the flush runs, and released afterwards either way
 */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEACHER = { id: 1, roles: [], assignments: [{ subjectGrade: 5, role: 'editor' }] }
const ADMIN = { id: 1, roles: ['siteAdmin'], assignments: [] }

const mocks = vi.hoisted(() => ({
  keepForLater: vi.fn(),
  reset: vi.fn(),
  setProcessing: vi.fn(),
  user: {} as unknown,
  modified: true,
  confirm: vi.fn((_message?: string) => true),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('edit=1'),
}))
vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, disabled, onClick }: React.ComponentProps<'button'>) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  useAllFormFields: () => [{}],
  useAuth: () => ({ user: mocks.user }),
  useDocumentInfo: () => ({
    id: 1,
    savedDocumentData: { lessonPlan: 2, subjectGrade: 5, author: 1, overview: 'saved' },
  }),
  useForm: () => ({
    initializing: false,
    dispatchFields: vi.fn(),
    getData: () => ({ overview: 'typed' }),
    setProcessing: mocks.setProcessing,
    setModified: vi.fn(),
    setDisabled: vi.fn(),
    reset: mocks.reset,
  }),
  useFormModified: () => mocks.modified,
}))
vi.mock('@/components/EditRecovery/useEditRecovery', () => ({
  useEditRecovery: () => ({
    entry: { phase: 'clear' },
    status: { kind: 'idle' },
    start: vi.fn(),
    prepareForSave: vi.fn(),
    keepForLater: mocks.keepForLater,
    adoptToken: vi.fn(),
  }),
}))
vi.mock('@/components/EditRecovery/Indicator', () => ({ EditRecoveryIndicator: () => null }))
vi.mock('@/components/LessonControls/EditJumpNav', () => ({ default: () => null }))

import LessonControls from '@/components/LessonControls'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user = TEACHER
  mocks.modified = true
  mocks.confirm = vi.fn((_message?: string) => true)
  vi.stubGlobal('confirm', mocks.confirm)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ officialVersion: 99 })))
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const keepButton = () => screen.getByRole('button', { name: 'Keep for later' })

describe('Keep for later', () => {
  it('B1 kept: clears the screen, leaves edit mode and says until when', async () => {
    mocks.keepForLater.mockResolvedValue({ kind: 'kept', at: Date.parse('2026-10-17T09:00:00Z') })
    render(<LessonControls />)

    fireEvent.click(keepButton())

    // A status, not an alert: success must not render in the error colour.
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('kept until 16 Nov 2026')
    expect(status.textContent).toContain('Your unsaved work')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mocks.reset).toHaveBeenCalledWith(expect.objectContaining({ overview: 'saved' }))
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    // A teacher with editing access is not asked anything: everything they can edit is kept.
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it.each([
    ['failed', 'still on screen'],
    ['conflict', 'another tab'],
    ['unavailable', 'not available'],
  ] as const)('B2 notKept (%s): the work stays on screen', async (reason, phrase) => {
    mocks.keepForLater.mockResolvedValue({ kind: 'notKept', reason })
    render(<LessonControls />)

    fireEvent.click(keepButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(phrase)
    expect(mocks.reset, 'the only copy must not be cleared').not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('B3 an administrator is warned first, and "no" does nothing', async () => {
    mocks.user = ADMIN
    mocks.confirm = vi.fn((_message?: string) => false)
    vi.stubGlobal('confirm', mocks.confirm)
    render(<LessonControls />)

    fireEvent.click(keepButton())

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    expect(String(mocks.confirm.mock.calls[0][0])).toContain('answer keys')
    expect(mocks.keepForLater).not.toHaveBeenCalled()
    expect(mocks.reset).not.toHaveBeenCalled()
  })

  it('B3b an administrator who agrees has their wording kept', async () => {
    mocks.user = ADMIN
    mocks.keepForLater.mockResolvedValue({ kind: 'kept', at: Date.now() })
    render(<LessonControls />)

    fireEvent.click(keepButton())

    await waitFor(() => expect(mocks.reset).toHaveBeenCalled())
    expect(mocks.keepForLater).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['kept', { kind: 'kept', at: Date.now() }],
    ['notKept', { kind: 'notKept', reason: 'failed' }],
  ] as const)('B5 locked during the flush, released after (%s)', async (_label, outcome) => {
    let finish: (r: unknown) => void = () => {}
    mocks.keepForLater.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    render(<LessonControls />)

    fireEvent.click(keepButton())
    // Locked synchronously on the click, before the flush is awaited.
    expect(mocks.setProcessing).toHaveBeenLastCalledWith(true)

    finish(outcome)
    await waitFor(() => expect(mocks.setProcessing).toHaveBeenLastCalledWith(false))
  })

  it('B4 a pristine form has nothing to keep', () => {
    mocks.modified = false
    render(<LessonControls />)
    expect(keepButton().hasAttribute('disabled')).toBe(true)
  })
})
