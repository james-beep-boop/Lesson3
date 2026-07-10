import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadExport, ensureExportReady, type ExportState } from '@/components/exportClient'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('export client handshake', () => {
  it('reports Preparing while a cold export polls to ready', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          {
            state: 'preparing',
            statusUrl: '/api/lesson-bundle-versions/1/export/status?jobId=2&as=pdf',
            retryAfterMs: 0,
          },
          202,
        ),
      )
      .mockResolvedValueOnce(json({ state: 'ready' }))
    vi.stubGlobal('fetch', fetchMock)
    const states: ExportState[] = []

    await ensureExportReady('/api/lesson-bundle-versions/1/export?as=pdf', {
      onState: (state) => states.push(state),
    })

    expect(states).toEqual(['preparing'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces a status HTTP failure instead of polling until timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ state: 'preparing', statusUrl: '/status', retryAfterMs: 0 }, 202),
        )
        .mockResolvedValueOnce(json({ errors: [{ message: 'Your session has expired.' }] }, 401)),
    )
    const updates: Array<[ExportState, string | undefined]> = []

    await expect(
      ensureExportReady('/export', {
        onState: (state, message) => updates.push([state, message]),
      }),
    ).rejects.toThrow('Your session has expired.')
    expect(updates.at(-1)).toEqual(['error', 'Your session has expired.'])
  })

  it('moves a ZIP download to a visible error when the final GET loses the network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json({ state: 'ready' })).mockRejectedValueOnce(new TypeError()),
    )
    const updates: Array<[ExportState, string | undefined]> = []

    await expect(
      downloadExport('/export', {
        onState: (state, message) => updates.push([state, message]),
      }),
    ).rejects.toThrow('Could not reach the export service')
    expect(updates.map(([state]) => state)).toEqual(['preparing', 'downloading', 'error'])
    expect(updates.at(-1)?.[1]).toContain('check your connection')
  })
})
