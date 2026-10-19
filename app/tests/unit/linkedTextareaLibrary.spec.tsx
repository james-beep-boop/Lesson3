// @vitest-environment jsdom
/** Real dialog lifecycle with Payload's form adapter stubbed; no server or filesystem required. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TextareaFieldClientProps } from 'payload'

import LinkedTextarea from '../../src/components/LinkedTextarea'
import {
  clearActiveLinkTarget,
  openActiveLinkTarget,
} from '../../src/components/LinkedTextarea/activeTarget'

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useField: () => ({ value: '', setValue: vi.fn(), disabled: false }),
  TextareaField: () => <textarea aria-label="Learner experience" />,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../../src/components/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
}))

afterEach(() => {
  cleanup()
  clearActiveLinkTarget()
  vi.unstubAllGlobals()
})

function mount(configured: boolean) {
  const result = render(
    <LinkedTextarea
      {...({ path: 'lessons.0.framework.0.learnerExperience' } as TextareaFieldClientProps)}
      pdfLibraryConfigured={configured}
    />,
  )
  fireEvent.focus(screen.getByRole('textbox', { name: 'Learner experience' }))
  act(() => openActiveLinkTarget())
  return result
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const response = (configured = true) => Response.json({ configured, files: [] })

describe('PDF picker request lifetime', () => {
  it('makes no listing request on an unconfigured installation, including on reopen', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    mount(false)
    expect(screen.queryByRole('region', { name: 'PDFs on the Rock' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    act(() => openActiveLinkTarget())
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Insert address' }).hasAttribute('disabled')).toBe(
      false,
    )
  })

  it('shows the configured section immediately and keeps addresses usable during loading', async () => {
    const pending = deferred<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => pending.promise),
    )
    mount(true)
    const region = screen.getByRole('region', { name: 'PDFs on the Rock' })
    expect(region.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText('No PDF files are available.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Insert address' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'Enter a complete web address starting with http:// or https://.',
    )
    // A delayed PDF error must not erase validation of the teacher's address.
    await act(async () => pending.resolve(Response.json({ error: 'Unavailable' }, { status: 503 })))
    expect(region.getAttribute('aria-busy')).toBe('false')
    expect(screen.getAllByRole('alert').map((el) => el.textContent)).toEqual(
      expect.arrayContaining([
        'Enter a complete web address starting with http:// or https://.',
        'Could not load PDFs from the Rock. You can still paste a web address.',
      ]),
    )
  })

  it('aborts on close and ignores a late failure after reopening; the new request owns its result', async () => {
    const old = deferred<Response>()
    const fetch = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response())
    vi.stubGlobal('fetch', fetch)
    mount(true)
    const signal = fetch.mock.calls[0][1]!.signal as AbortSignal
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(signal.aborted).toBe(true)
    act(() => openActiveLinkTarget())
    await waitFor(() => expect(screen.getByText('No PDF files are available.')).toBeTruthy())
    await act(async () => old.resolve(Response.json({ error: 'Old failure' }, { status: 503 })))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('aborts on insertion and unmount, without waiting for PDF loading', () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetch)
    const first = mount(true)
    const signal = fetch.mock.calls[0][1]!.signal as AbortSignal
    fireEvent.change(screen.getByLabelText('Web address'), {
      target: { value: 'http://ares.local/modules/a' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Insert address' }))
    expect(signal.aborted).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    first.unmount()
    const second = mount(true)
    const secondSignal = fetch.mock.calls[1][1]!.signal as AbortSignal
    second.unmount()
    expect(secondSignal.aborted).toBe(true)
  })
})
