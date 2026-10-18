// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mock = vi.hoisted(() => ({
  modified: false,
  dispatch: vi.fn(),
  reset: vi.fn(),
  getData: vi.fn(),
  fields: {},
  entry: { phase: 'clear' } as Record<string, unknown>,
  load: vi.fn(),
  keep: vi.fn(),
  setProcessing: vi.fn(),
  // ⚑ STABLE across renders, like Payload's own form setters. A fresh function per render made the
  // apply effect (which lists `setModified` as a dependency) silently re-run and succeed after the
  // deliberate failure, so the retry test passed or failed on timing (2026-10-18).
  setModified: vi.fn(),
  setDisabled: vi.fn(),
  saved: {
    id: 1,
    lessonPlan: 7,
    subjectGrade: 5,
    author: 1,
    title: 'Lesson',
    lessons: [{ id: 'L1', overview: 'saved' }],
  },
  comparison: {
    a: { id: 1, semver: '1.0.1' },
    b: { id: 2, semver: '1.0.2' },
    base: null,
    plan: {
      ok: true,
      start: 'a',
      ancestry: 'two-way',
      overlay: { 'lesson:L1': { overview: 'combined' } },
      changes: [],
      conflicts: [],
    },
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, disabled, onClick }: React.ComponentProps<'button'>) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  useAllFormFields: () => [mock.fields],
  useAuth: () => ({ user: { id: 1, roles: ['siteAdmin'] } }),
  useDocumentInfo: () => ({ id: 1, savedDocumentData: mock.saved }),
  useForm: () => ({
    initializing: true,
    dispatchFields: mock.dispatch,
    getData: mock.getData,
    setProcessing: mock.setProcessing,
    setModified: mock.setModified,
    setDisabled: mock.setDisabled,
    reset: mock.reset,
  }),
  useFormModified: () => mock.modified,
}))
vi.mock('@/components/CombineVersions', () => ({
  loadComparison: mock.load,
  default: ({
    onBegin,
    context,
    remaining,
  }: {
    onBegin: (v: unknown) => void
    context: unknown
    remaining: number
  }) => (
    <>
      <button onClick={() => onBegin(mock.comparison)}>Begin test combination</button>
      {context && <p>Combine choices remaining: {remaining}</p>}
    </>
  ),
}))
vi.mock('@/components/EditRecovery/useEditRecovery', () => ({
  useEditRecovery: () => ({
    entry: mock.entry,
    status: { kind: 'idle' },
    start: vi.fn(),
    keepOffer: mock.keep,
  }),
}))
vi.mock('@/components/EditRecovery/RestorePrompt', () => ({
  EditRecoveryRestorePrompt: ({ onRestore }: { onRestore: () => void }) => (
    <button onClick={onRestore}>Restore test draft</button>
  ),
}))
vi.mock('@/components/EditRecovery/Indicator', () => ({ EditRecoveryIndicator: () => null }))
vi.mock('@/components/LessonControls/EditJumpNav', () => ({ default: () => null }))
import Controls from '@/components/LessonControls'
import { ComparisonError, PARENT_GONE } from '@/components/CombineVersions/comparisonError'
beforeEach(() => {
  vi.clearAllMocks()
  mock.modified = false
  mock.entry = { phase: 'clear' }
  mock.getData.mockReturnValue(structuredClone(mock.saved))
  mock.dispatch.mockImplementation(({ value }: { value: string }) => {
    mock.getData().lessons[0].overview = value
  })
  mock.reset.mockImplementation(async (doc) => {
    mock.getData.mockReturnValue(doc)
  })
  mock.keep.mockImplementation(() => {
    mock.entry = { phase: 'clear' }
  })
  mock.load.mockResolvedValue(mock.comparison)
  mock.setModified.mockImplementation((value: boolean) => {
    mock.modified = value
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ officialVersion: 99 })))
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const offer = (combine = true) => ({
  phase: 'offer',
  readOnly: false,
  anchors: [],
  capture: {
    content: { 'lesson:L1': { overview: 'private draft words' } },
    ...(combine ? { combineContext: { mergeParent: 2, resolvedKeys: [] } } : {}),
  },
})
it('retries applying an overlay after a field update fails, then unblocks Save without auto-saving', async () => {
  mock.dispatch.mockImplementationOnce(() => {
    throw new Error('form state unavailable')
  })
  render(<Controls />)
  fireEvent.click(screen.getByText('Begin test combination'))
  const retry = await screen.findByRole('button', { name: 'Retry combination' })
  expect(
    (screen.getByRole('button', { name: 'Save as new version' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(retry)
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Save as new version' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  expect(mock.getData().lessons[0].overview).toBe('combined')
  expect(mock.dispatch).toHaveBeenCalledTimes(2)
  expect(mock.reset).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Retry combination' })).toBeNull()
})
it('retries a restored draft comparison without applying the prose twice or losing its parent', async () => {
  mock.entry = offer()
  mock.load.mockRejectedValueOnce(new Error('offline'))
  render(<Controls />)
  fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }))
  fireEvent.click(screen.getByText('Restore test draft'))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry combination' }))
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Save as new version' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  expect(mock.reset).toHaveBeenCalledTimes(1)
  expect(mock.getData().lessons[0].overview).toBe('private draft words')
  expect(mock.load).toHaveBeenLastCalledWith(1, 2)
  expect(screen.getByText('Combine choices remaining: 0')).toBeTruthy()
})
it('continues as an ordinary draft when the preview refuses the stored second parent', async () => {
  // Restore returns the stored note unchecked; combine-preview's refusal (here a 404: deleted or
  // unreadable) is what turns the draft into an ordinary one — not a retry, which could never succeed.
  mock.entry = offer()
  mock.load.mockRejectedValueOnce(new ComparisonError(404))
  render(<Controls />)
  fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }))
  fireEvent.click(screen.getByText('Restore test draft'))
  await screen.findByText(PARENT_GONE)
  expect(screen.queryByRole('button', { name: 'Retry combination' })).toBeNull()
  expect(screen.queryByText(/Combine choices remaining/)).toBeNull()
  expect(mock.getData().lessons[0].overview).toBe('private draft words')
  expect(
    (screen.getByRole('button', { name: 'Save as new version' }) as HTMLButtonElement).disabled,
  ).toBe(false)
})
it('explains when restoring an ordinary draft cancels the new combination', async () => {
  mock.entry = offer(false)
  render(<Controls />)
  fireEvent.click(screen.getByText('Begin test combination'))
  fireEvent.click(screen.getByText('Restore test draft'))
  await screen.findByText(
    'Your earlier draft has been restored. The new combination was cancelled.',
  )
  expect(mock.getData().lessons[0].overview).toBe('private draft words')
  expect(mock.load).not.toHaveBeenCalled()
})
