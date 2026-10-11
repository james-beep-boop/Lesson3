// @vitest-environment jsdom
/**
 * The retained-layout check (`components/AppNav/NavigationFreshness.tsx`; review of #380, 2026-10-11).
 *
 * ⚑ THE LOAD-BEARING CASES: an ordinary soft navigation asks the small nav-state endpoint and does NOT
 * re-render the route; a switch-off or a changed dot DOES; and an unreadable answer refreshes, so a
 * switch-off is never missed to save a request. Nothing happens on arrival or for an unchanged URL.
 */
import React from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ path: '/lessons/1', query: '', refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ refresh: nav.refresh }),
}))
import NavigationFreshness, { type NavState } from '../../src/components/AppNav/NavigationFreshness'

const ON: NavState = { forumEnabled: true, unread: false }

function answer(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  nav.path = '/lessons/1'
  nav.query = ''
  nav.refresh.mockClear()
})

describe('navigation freshness', () => {
  it('does nothing on arrival or for an unchanged URL', () => {
    const fetchMock = answer(ON)
    const { rerender } = render(<NavigationFreshness rendered={ON} />)
    rerender(<NavigationFreshness rendered={ON} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  it('checks after a soft navigation, and does not re-render the route when nothing changed', async () => {
    const fetchMock = answer(ON)
    const { rerender } = render(<NavigationFreshness rendered={ON} />)
    nav.path = '/'
    rerender(<NavigationFreshness rendered={ON} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/discussion-topics/nav-state')
    await new Promise((r) => setTimeout(r, 0))
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  it('re-renders the route when the forum was switched off, or the dot changed', async () => {
    for (const now of [
      { forumEnabled: false, unread: false },
      { forumEnabled: true, unread: true },
    ]) {
      nav.refresh.mockClear()
      answer(now)
      const { rerender, unmount } = render(<NavigationFreshness rendered={ON} />)
      nav.query = `page=${Math.random()}`
      rerender(<NavigationFreshness rendered={ON} />)
      await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1))
      unmount()
    }
  })

  it('treats an unreadable answer as a change, so a switch-off is never missed', async () => {
    answer({ errors: [] }, 500)
    const first = render(<NavigationFreshness rendered={ON} />)
    nav.path = '/guide'
    first.rerender(<NavigationFreshness rendered={ON} />)
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1))
    first.unmount()

    nav.refresh.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network')
      }),
    )
    const second = render(<NavigationFreshness rendered={ON} />)
    nav.path = '/messages'
    second.rerender(<NavigationFreshness rendered={ON} />)
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1))
  })

  it('compares with the latest render, so a refresh that caught up stops further refreshes', async () => {
    const off = { forumEnabled: false, unread: false }
    const fetchMock = answer(off)
    const { rerender } = render(<NavigationFreshness rendered={ON} />)
    // The layout re-rendered (after a refresh) and now shows the forum off.
    rerender(<NavigationFreshness rendered={off} />)
    nav.path = '/'
    rerender(<NavigationFreshness rendered={off} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 0))
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  // ⚑ GPT review 2026-10-11: a stalled check must not leave stale forum controls on screen.
  it('treats a check that never answers as changed, after the deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )
    const { rerender } = render(<NavigationFreshness rendered={ON} timeoutMs={20} />)
    nav.path = '/'
    rerender(<NavigationFreshness rendered={ON} timeoutMs={20} />)
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1))
  })

  it('treats a response whose body never arrives as changed, after the deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) }) as unknown as Response),
    )
    const { rerender } = render(<NavigationFreshness rendered={ON} timeoutMs={20} />)
    nav.path = '/'
    rerender(<NavigationFreshness rendered={ON} timeoutMs={20} />)
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1))
  })

  it('a check cancelled by a newer navigation does nothing; the newer one decides', async () => {
    let first = true
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (first) {
        first = false
        // Settles only when cancelled — and then as an abort, which must not refresh.
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
        )
      }
      return Promise.resolve(new Response(JSON.stringify(ON)))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { rerender } = render(<NavigationFreshness rendered={ON} timeoutMs={60_000} />)
    nav.path = '/a'
    rerender(<NavigationFreshness rendered={ON} timeoutMs={60_000} />)
    nav.path = '/b'
    rerender(<NavigationFreshness rendered={ON} timeoutMs={60_000} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 0))
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  // ⚑ Back/Forward restore the PAGE from Next's client cache, which may be stale in ways no summary
  // shows (a redaction, new replies) — so history traversal always refreshes, without asking.
  it('always refreshes after Back/Forward, without a check', async () => {
    const fetchMock = answer(ON)
    const { rerender } = render(<NavigationFreshness rendered={ON} />)
    window.dispatchEvent(new PopStateEvent('popstate'))
    nav.path = '/discuss/7'
    rerender(<NavigationFreshness rendered={ON} />)
    expect(nav.refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    // The next ordinary navigation goes back to the cheap check.
    nav.path = '/'
    rerender(<NavigationFreshness rendered={ON} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 0))
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })

  // ⚑ The order observed in Chromium (e2e, 2026-10-11): the Navigation API's `navigate` (traverse),
  // then the restored route renders, and only then `popstate`.
  it('sees Back/Forward announced by the Navigation API before the route renders', async () => {
    const navigation = new EventTarget()
    Object.defineProperty(window, 'navigation', { value: navigation, configurable: true })
    try {
      const fetchMock = answer(ON)
      const { rerender } = render(<NavigationFreshness rendered={ON} />)
      const navigate = (navigationType: string) =>
        navigation.dispatchEvent(Object.assign(new Event('navigate'), { navigationType }))

      navigate('push')
      nav.path = '/discuss'
      rerender(<NavigationFreshness rendered={ON} />)
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      await new Promise((r) => setTimeout(r, 0))
      expect(nav.refresh).not.toHaveBeenCalled()

      navigate('traverse')
      nav.path = '/discuss/7'
      rerender(<NavigationFreshness rendered={ON} />)
      expect(nav.refresh).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      delete (window as Window & { navigation?: EventTarget }).navigation
    }
  })

  // Without the Navigation API: Next's own popstate listener is registered BEFORE this one and renders
  // the restored route from inside the event, so this one must capture.
  it('sees Back/Forward even when an earlier listener renders the new route first', async () => {
    const fetchMock = answer(ON)
    let rerender: ((ui: React.ReactElement) => void) | undefined
    const routerLike = () => {
      nav.path = '/discuss/7'
      act(() => rerender?.(<NavigationFreshness rendered={ON} />))
    }
    window.addEventListener('popstate', routerLike)
    try {
      rerender = render(<NavigationFreshness rendered={ON} />).rerender
      window.dispatchEvent(new PopStateEvent('popstate'))
      expect(nav.refresh).toHaveBeenCalledTimes(1)
      await new Promise((r) => setTimeout(r, 0))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('popstate', routerLike)
    }
  })
})
