// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
import ModerationControls from '../../src/components/Discussions/ModerationControls'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('moderation controls', () => {
  it('redacts only the selected topic part through the moderation endpoint', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    render(
      <ModerationControls
        target={{ kind: 'topic', id: 12, pinned: false, titleRemoved: false, forumEnabled: true }}
        bodyRemoved={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Redact topic' }))
    expect((screen.getByRole('button', { name: 'Redact' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByLabelText('Title'))
    fireEvent.click(screen.getByRole('button', { name: 'Redact' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1))
    const [url, request] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/discussion-topics/12/redact')
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body as string)).toEqual({ title: true })
  })

  it('reply redaction uses its record id, and a lost answer requires reloading rather than another write', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Lost answer')
    })
    vi.stubGlobal('fetch', fetch)
    render(<ModerationControls target={{ kind: 'reply', id: 814 }} bodyRemoved={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Redact reply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redact' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy())
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe('/api/discussion-replies/814/redact')
    expect(screen.queryByRole('button', { name: 'Redact' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      (screen.getByRole('button', { name: 'Redact reply' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('offers neither pin nor already-redacted parts while off, but preserves whole-thread deletion', () => {
    render(
      <ModerationControls
        target={{ kind: 'topic', id: 12, pinned: true, titleRemoved: true, forumEnabled: false }}
        bodyRemoved
      />,
    )
    expect(screen.queryByRole('button', { name: 'Unpin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Redact topic' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete thread' })).toBeTruthy()
  })
})
