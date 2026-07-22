import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  downloadExport,
  ensureExportReady,
  openGeneratedPdfInNewTab,
  openPreparedPdfInNewTab,
  type ExportState,
} from '@/components/exportClient'

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

/**
 * The two "open a PDF in a new tab" twins. These exist because the divergence between them has
 * already recurred once: #133 fixed the unchecked post-`await` `window.open` retry in
 * `openGeneratedPdfInNewTab` but left the identical bug in `openPreparedPdfInNewTab` — the
 * teacher-facing per-document path — where a popup-blocked preview resolved as SUCCESS having opened
 * nothing. Both now share `deliverToTab`; this pins the property so a future edit to either twin
 * cannot silently reintroduce silent success. (2026-07-21 review, finding #2.)
 */
describe('open-in-new-tab twins: a blocked popup must surface an error, never resolve silently', () => {
  type FakeTab = {
    location: { href: string }
    document: { title: string; body: { textContent: string } }
    close: ReturnType<typeof vi.fn>
  }
  const makeTab = (): FakeTab => ({
    location: { href: '' },
    document: { title: '', body: { textContent: '' } },
    close: vi.fn(),
  })

  /** Stub the browser globals both twins touch. `open` is scripted per call: the FIRST call is the
   *  synchronous placeholder open, any later call is the post-await retry. */
  const stubBrowser = (opens: Array<FakeTab | null>) => {
    const open = vi.fn(() => opens.shift() ?? null)
    const revoke = vi.fn()
    vi.stubGlobal('window', { open, setTimeout: vi.fn(), clearTimeout: vi.fn() })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: revoke })
    return { open, revoke }
  }

  const ready = () =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ state: 'ready' })))
  const readyBlob = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200 })),
    )

  describe('openPreparedPdfInNewTab (teacher per-document + editor "View as PDF")', () => {
    it('navigates the placeholder tab when the popup opened', async () => {
      const tab = makeTab()
      stubBrowser([tab])
      ready()
      await openPreparedPdfInNewTab('/export', '/doc.pdf')
      expect(tab.location.href).toBe('/doc.pdf')
    })

    it('opens a fresh tab when the placeholder was blocked but the retry is allowed', async () => {
      const retry = makeTab()
      const { open } = stubBrowser([null, retry]) // placeholder blocked, retry allowed
      ready()
      await expect(openPreparedPdfInNewTab('/export', '/doc.pdf')).resolves.toBeUndefined()
      expect(open).toHaveBeenLastCalledWith('/doc.pdf', '_blank')
    })

    it('throws an actionable error when BOTH opens are blocked (never resolves silently)', async () => {
      stubBrowser([null, null])
      ready()
      await expect(openPreparedPdfInNewTab('/export', '/doc.pdf')).rejects.toThrow(/blocked the preview/i)
    })
  })

  describe('openGeneratedPdfInNewTab (unsaved working-copy twin)', () => {
    it('navigates the placeholder tab to the blob when the popup opened', async () => {
      const tab = makeTab()
      stubBrowser([tab])
      readyBlob()
      await openGeneratedPdfInNewTab('/generate', new FormData())
      expect(tab.location.href).toBe('blob:pdf')
    })

    it('throws AND revokes the blob when both opens are blocked (no silent success, no leak)', async () => {
      const { revoke } = stubBrowser([null, null])
      readyBlob()
      await expect(openGeneratedPdfInNewTab('/generate', new FormData())).rejects.toThrow(
        /blocked the preview/i,
      )
      expect(revoke).toHaveBeenCalledWith('blob:pdf') // the blob nothing will load is not left dangling
    })
  })
})
