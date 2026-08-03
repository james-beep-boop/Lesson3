// @vitest-environment jsdom
/**
 * Manage → Upload lesson plans: the stale-results defect (operator report 2026-08-02).
 *
 * After a successful upload the panel kept the PREVIOUS upload's result list on screen. The file
 * picker was reset, so the panel read as though those files were still queued — an administrator
 * could reasonably think they were about to re-upload them.
 *
 * The fix clears the results when the picker is OPENED (`onClick`), not when files arrive
 * (`onChange`). That distinction is the whole point and it is what this file pins: `onChange` alone
 * leaves the stale list on screen for as long as the OS dialog is open, and leaves it there
 * permanently if the administrator CANCELS the dialog — the case with no `change` event at all.
 *
 * Verified manually against a real 573KB ARES file before this test existed; the test is here so it
 * stays fixed.
 *
 * `@payloadcms/ui` is stubbed: the real module imports CSS the unit-test config cannot load. Only
 * `Button`, `toast` and `useAuth`/`useConfig` are needed, and each is stubbed as what it renders or
 * returns.
 */
import React from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    className?: string
  }) => (
    <button className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  toast: { success: toastSuccess, error: toastError },
  // Site Admin — the panel renders nothing for anyone else.
  useAuth: () => ({ user: { id: 1, roles: ['siteAdmin'] } }),
  useConfig: () => ({ config: { serverURL: '', routes: { api: '/api' } } }),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const UploadBundles = (await import('@/components/UploadBundles')).default

/** One successful upload response, matching the endpoint's shape. */
const okResponse = {
  ok: true,
  count: 1,
  bundles: [
    {
      file: 'cell_structure.json',
      id: 42,
      title: 'BIOLOGY GRADE 10: CELL STRUCTURE',
      semver: '1.0.0',
      official: true,
      action: 'created' as const,
      warnings: [],
    },
  ],
}

const pickFile = (input: HTMLInputElement, name: string) => {
  const file = new File(['{}'], name, { type: 'application/json' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

/** The result list's rendered text, or '' when no list is shown. */
const resultsText = (container: HTMLElement) => container.querySelector('ul')?.textContent ?? ''

/** Drive one upload to completion and assert the result list is on screen. */
const uploadOnce = async (container: HTMLElement) => {
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  pickFile(input, 'cell_structure.json')
  fireEvent.click(screen.getByRole('button', { name: /^Upload/ }))
  await waitFor(() => expect(resultsText(container)).toContain('CELL STRUCTURE'))
  return input
}

beforeEach(() => {
  toastSuccess.mockClear()
  toastError.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(okResponse), { status: 200 })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('upload results do not outlive the upload', () => {
  it('shows the result list after a successful upload', async () => {
    const { container } = render(<UploadBundles />)
    await uploadOnce(container)
    // Sanity: the fix must not be "never show results at all".
    expect(resultsText(container)).toContain('#42')
  })

  it('clears the previous results when the picker is OPENED, before any file is chosen', async () => {
    // THE regression. `click` is the picker opening — no `change` yet, and there may never be one.
    const { container } = render(<UploadBundles />)
    const input = await uploadOnce(container)

    fireEvent.click(input)

    await waitFor(() => expect(resultsText(container)).not.toContain('CELL STRUCTURE'))
  })

  it('leaves nothing behind when the administrator CANCELS the dialog', async () => {
    // Cancelling fires `click` and never `change`. An onChange-only fix would still be showing the
    // old filenames here — which is exactly how the bug was reported.
    const { container } = render(<UploadBundles />)
    const input = await uploadOnce(container)

    fireEvent.click(input) // dialog opens
    // …and closes with no selection: no change event, no new files.

    await waitFor(() => expect(resultsText(container)).not.toContain('#42'))
    expect(
      (screen.getByRole('button', { name: /^Upload/ }) as HTMLButtonElement).disabled,
      'the picker is empty again, so Upload is unavailable',
    ).toBe(true)
  })

  it('also clears on change, for paths that set files without a click', async () => {
    // Drag-and-drop and programmatic assignment do not open the picker. Belt and braces: the two
    // handlers cover different entry points rather than duplicating one.
    const { container } = render(<UploadBundles />)
    const input = await uploadOnce(container)

    pickFile(input, 'another.json')

    await waitFor(() => expect(resultsText(container)).not.toContain('#42'))
  })

  it('resets the picker after a successful upload so the same files cannot be re-sent', async () => {
    const { container } = render(<UploadBundles />)
    const input = await uploadOnce(container)
    expect(input.value).toBe('')
    expect((screen.getByRole('button', { name: /^Upload/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})
