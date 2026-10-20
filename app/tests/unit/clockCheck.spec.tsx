// @vitest-environment jsdom
/** The Manage clock warning (2026-10-19): one fresh check, advice only. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { serverURL: '', routes: { api: '/api' } } }),
}))

import { ClockCheck } from '@/components/Manage/ClockCheck'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const serverSays = (now: unknown, ok = true) => {
  const fetchMock = vi.fn(async (_input: string) =>
    Response.json({ now }, { status: ok ? 200 : 403 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ClockCheck', () => {
  it('warns, naming both clocks, when the server is far off', async () => {
    serverSays(Date.parse('2001-01-01T08:00:00Z'))
    render(<ClockCheck />)
    const warning = await screen.findByRole('alert')
    expect(warning.textContent).toMatch(/The server and this device show different times\./)
    expect(warning.textContent).toMatch(/Server: .*2001/)
    expect(warning.textContent).toMatch(/This device’s clock may also need checking\./)
  })

  it('stays silent when the clocks agree', async () => {
    const fetchMock = serverSays(Date.now() + 60_000)
    render(<ClockCheck />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stays silent when the check itself fails', async () => {
    const fetchMock = serverSays(0, false)
    render(<ClockCheck />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignores a reading whose reply arrived after the device slept (#417 review)', async () => {
    // Both clocks agree at the moment the server answers, but the device sleeps three hours before
    // handling the reply. Without the round-trip limit the midpoint invents a 90-minute discrepancy.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const fetchMock = vi.fn(async (_input: string) => {
        const answer = Date.now()
        vi.setSystemTime(answer + 3 * 60 * 60 * 1000)
        return Response.json({ now: answer })
      })
      vi.stubGlobal('fetch', fetchMock)
      render(<ClockCheck />)
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks the server fresh, once, and never again while the page stays open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const fetchMock = serverSays(Date.now())
      render(<ClockCheck />)
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/server-time')
      vi.advanceTimersByTime(3 * 60 * 60 * 1000) // the device clock moves on; nothing re-compares
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
