// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getData: vi.fn(() => ({ overview: 'snapshot A' })),
  setProcessing: vi.fn(),
  setModified: vi.fn(),
  prepareForSave: vi.fn(),
  push: vi.fn(),
  adoptToken: vi.fn(),
  id: 1,
  fields: {},
  initializing: true,
  dispatchFields: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams('edit=1'),
}))
vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, disabled, onClick }: React.ComponentProps<'button'>) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  useAllFormFields: () => [mocks.fields],
  useAuth: () => ({ user: { id: 1, roles: ['siteAdmin'], assignments: [] } }),
  useDocumentInfo: () => ({
    id: mocks.id,
    savedDocumentData: { lessonPlan: 2, subjectGrade: 5, author: 1 },
  }),
  useForm: () => ({
    initializing: mocks.initializing,
    dispatchFields: mocks.dispatchFields,
    getData: mocks.getData,
    setProcessing: mocks.setProcessing,
    setModified: mocks.setModified,
    setDisabled: vi.fn(),
    reset: vi.fn(),
  }),
  useFormModified: () => true,
}))
vi.mock('@/components/EditRecovery/useEditRecovery', () => ({
  useEditRecovery: () => ({
    entry: { phase: 'clear' },
    status: { kind: 'idle' },
    start: vi.fn(),
    prepareForSave: mocks.prepareForSave,
    adoptToken: mocks.adoptToken,
  }),
}))
vi.mock('@/components/EditRecovery/Indicator', () => ({ EditRecoveryIndicator: () => null }))
vi.mock('@/components/LessonControls/EditJumpNav', () => ({ default: () => null }))

import LessonControls from '@/components/LessonControls'
import { WARNING_TIMEOUT_MS } from '@/components/EditRecovery/unsavedWarning'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.id = 1
  mocks.fields = {}
  mocks.initializing = true
  mocks.getData.mockReturnValue({ overview: 'snapshot A' })
  mocks.prepareForSave.mockResolvedValue({ proceed: true, token: { generation: 1, revision: 2 } })
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  )
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('save snapshot lifecycle', () => {
  it('a tokenless save preserves the source without offering deletion or querying draft counts', async () => {
    mocks.prepareForSave.mockResolvedValue({ proceed: true, token: null })
    const fetcher = vi.fn((url: string) =>
      Promise.resolve(
        Response.json(
          url.includes('save-as-new') ? { adminUrl: '/new-version' } : { officialVersion: 99 },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetcher)
    render(<LessonControls />)
    await screen.findByText('Not Official')
    fireEvent.click(screen.getByRole('button', { name: 'Save as new version' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/new-version'))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(fetcher.mock.calls.some(([url]) => url.includes('/recovery/unsaved-count'))).toBe(false)
    expect(fetcher.mock.calls.find(([url]) => url.includes('save-as-new'))![0]).not.toContain(
      'deleteSource',
    )
  })

  it.each([false, true])(
    'respects the entry phase in the delayed row-collapse pass (user input: %s)',
    async (interacted) => {
      vi.useFakeTimers()
      mocks.initializing = false
      mocks.fields = { lessons: { rows: [{ id: 'row-a', collapsed: false }] } }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ officialVersion: 99 })))
      render(<LessonControls />)
      if (interacted) fireEvent.pointerDown(document)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      if (interacted) expect(mocks.dispatchFields).not.toHaveBeenCalled()
      else expect(mocks.dispatchFields).toHaveBeenCalled()
    },
  )

  it.each([false, true])(
    'locks before recovery and stays locked until navigation (delete source: %s)',
    async (deleteSource) => {
      vi.stubGlobal(
        'confirm',
        vi.fn(() => deleteSource),
      )
      const capture = deferred<{
        proceed: boolean
        token: { generation: number; revision: number }
      }>()
      const save = deferred<Response>()
      mocks.prepareForSave.mockImplementation(() => {
        expect(mocks.setProcessing).toHaveBeenLastCalledWith(true)
        return capture.promise
      })
      const fetcher = vi.fn((url: string) =>
        url.includes('save-as-new')
          ? save.promise
          : Promise.resolve(Response.json({ officialVersion: 99 })),
      )
      vi.stubGlobal('fetch', fetcher)
      const view = render(<LessonControls />)
      await screen.findByText('Not Official')
      fireEvent.click(screen.getByRole('button', { name: 'Save as new version' }))
      expect(mocks.setProcessing).toHaveBeenLastCalledWith(true)
      expect(mocks.push).not.toHaveBeenCalled()
      expect(fetcher.mock.calls.filter(([url]) => url.includes('save-as-new'))).toHaveLength(0)
      await act(async () => {
        capture.resolve({ proceed: true, token: { generation: 1, revision: 2 } })
      })
      const request = (fetcher.mock.calls as unknown as [string, RequestInit][]).find(([url]) =>
        url.includes('save-as-new'),
      )!
      expect(request[0].includes('deleteSource=true')).toBe(deleteSource)
      expect((request[1].body as FormData).get('data')).toBe(
        JSON.stringify({ overview: 'snapshot A' }),
      )
      expect(mocks.setProcessing).toHaveBeenLastCalledWith(true)
      expect(mocks.setModified).not.toHaveBeenCalled()
      await act(async () => {
        save.resolve(Response.json({ adminUrl: '/new-version' }))
      })
      expect(mocks.push).toHaveBeenCalledWith('/new-version')
      expect(mocks.setModified).toHaveBeenCalledWith(false)
      expect(mocks.setProcessing).toHaveBeenLastCalledWith(true)
      // Next can reuse the mounted component for the next version. Release the old lock then.
      mocks.id = 3
      view.rerender(<LessonControls />)
      expect(mocks.setProcessing).toHaveBeenLastCalledWith(false)
      expect(
        screen.getByRole('button', { name: 'Save as new version' }).hasAttribute('disabled'),
      ).toBe(false)
    },
  )

  /**
   * ⚑ A STALLED ADVISORY LOOKUP MUST NOT HOLD THE SAVE (audit 2026-10-17). Save locks the form, then
   * asks how many people hold drafts on the version it may delete. That request never answering left
   * "Saving…" on screen forever and `save-as-new` unsent. It now gives up after a short deadline and
   * the confirmation opens without the warning.
   */
  it('a never-answering draft-count lookup does not block the save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const confirm = vi.fn((_message?: string) => false)
    vi.stubGlobal('confirm', confirm)
    const fetcher = vi.fn((url: string) =>
      url.includes('/recovery/unsaved-count')
        ? new Promise<Response>(() => {})
        : url.includes('save-as-new')
          ? Promise.resolve(Response.json({ adminUrl: '/new-version' }))
          : Promise.resolve(Response.json({ officialVersion: 99 })),
    )
    vi.stubGlobal('fetch', fetcher)
    render(<LessonControls />)
    await screen.findByText('Not Official')

    fireEvent.click(screen.getByRole('button', { name: 'Save as new version' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WARNING_TIMEOUT_MS)
    })

    // The confirmation opened WITHOUT the warning, and the save went ahead.
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(String(confirm.mock.calls[0][0])).not.toContain('draft')
    await waitFor(() => expect(mocks.prepareForSave).toHaveBeenCalled())
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => String(url).includes('save-as-new'))).toBe(true),
    )
  })

  it.each(['conflict', 'capture error', 'save error'])(
    'unlocks and retains dirty content after %s',
    async (failure) => {
      if (failure === 'conflict') mocks.prepareForSave.mockResolvedValue({ proceed: false })
      if (failure === 'capture error')
        mocks.prepareForSave.mockRejectedValue(new Error('capture failed'))
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          Promise.resolve(
            url.includes('save-as-new')
              ? Response.json({ errors: [{ message: 'save failed' }] }, { status: 500 })
              : Response.json({ officialVersion: 99 }),
          ),
        ),
      )
      render(<LessonControls />)
      fireEvent.click(screen.getByRole('button', { name: 'Save as new version' }))
      await screen.findByRole('alert')
      expect(mocks.setProcessing).toHaveBeenLastCalledWith(false)
      expect(mocks.setModified).not.toHaveBeenCalledWith(false)
      expect(mocks.push).not.toHaveBeenCalled()
      expect(mocks.getData()).toEqual({ overview: 'snapshot A' })
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Save as new version' }).hasAttribute('disabled'),
        ).toBe(false),
      )
    },
  )
})
