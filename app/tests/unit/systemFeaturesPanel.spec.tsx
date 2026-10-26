// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick: () => void
    disabled: boolean
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

import { SystemFeaturesPanel } from '../../src/components/Manage/SystemFeaturesPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const INITIAL = {
  schoolName: '',
  features: { forumEnabled: true, advancedTools: false },
  updatedAt: '2026-10-11T01:00:00.000Z',
}

function openSave(label = 'Discussions enabled') {
  render(<SystemFeaturesPanel initial={INITIAL} />)
  fireEvent.click(screen.getByLabelText(label))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

describe('System Features Save', () => {
  it('never writes when toggled or when confirmation is cancelled', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    openSave()
    expect(screen.getByText('Switch Discussions off.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(fetch).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Discussions enabled') as HTMLInputElement).checked).toBe(false)
  })

  it('sends only the pending change, password and original freshness token', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        updatedAt: '2026-10-11T02:00:00.000Z',
        schoolName: '',
        features: { forumEnabled: false, advancedTools: false },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    openSave()
    fireEvent.change(screen.getByLabelText('Your password'), {
      target: { value: 'secret-for-test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    const [url, request] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/globals/system-settings/save')
    expect(JSON.parse(request.body as string)).toEqual({
      changes: { forumEnabled: false },
      password: 'secret-for-test',
      expectedUpdatedAt: '2026-10-11T01:00:00.000Z',
    })
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('switching Advanced tools sends only that change and leaves Discussions as it was', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        updatedAt: '2026-10-11T02:00:00.000Z',
        schoolName: '',
        features: { forumEnabled: true, advancedTools: true },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    openSave('Advanced tools')
    expect(screen.getByText('Switch Advanced tools on.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(screen.getByText('Advanced tools switched on.')).toBeTruthy())
    const [, request] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(request.body as string).changes).toEqual({ advancedTools: true })
    expect((screen.getByLabelText('Discussions enabled') as HTMLInputElement).checked).toBe(true)
  })

  it.each([401, 429])(
    'shows the server’s %s refusal, clears the password and keeps the pending change',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ errors: [{ message: 'Plain refusal' }] }, { status })),
      )
      openSave()
      fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Plain refusal'))
      expect((screen.getByLabelText('Your password') as HTMLInputElement).value).toBe('')
      expect(refresh).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByText('Unsaved change: switch Discussions off.')).toBeTruthy()
    },
  )

  it.each(['stale', 'lost response'])(
    'requires a reload after %s instead of blindly resubmitting',
    async (scenario) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          if (scenario === 'lost response') throw new TypeError('network')
          return Response.json({ errors: [{ message: 'Reload before saving.' }] }, { status: 409 })
        }),
      )
      openSave()
      fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'secret' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Reload settings' })).toBeTruthy(),
      )
      expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(
        true,
      )
    },
  )
})
