// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DisplayNameForm } from '../../src/components/UserMenu/DisplayNameForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DisplayNameForm', () => {
  it('Cancel discards the draft and validation error before the form is reopened', () => {
    render(<DisplayNameForm userId={7} displayName="Current name" />)

    fireEvent.click(screen.getByRole('button', { name: 'Change display name' }))
    const input = screen.getByLabelText('Display name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toContain('Enter a display name')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change display name' }))

    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Current name')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('bounds the PATCH and recovers the controls with useful copy when it times out', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    vi.stubGlobal('fetch', fetchMock)
    render(<DisplayNameForm userId={7} displayName="Current name" />)

    fireEvent.click(screen.getByRole('button', { name: 'Change display name' }))
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('took too long'))
    expect(timeout).toHaveBeenCalledWith(15_000)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/7',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })
})
