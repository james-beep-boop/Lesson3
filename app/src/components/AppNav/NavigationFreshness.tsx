'use client'

/**
 * Keeps the frontend honest across client-side navigations, cheaply (review of #380, 2026-10-11).
 *
 * Next keeps the LAYOUT when the URL changes client-side, and on Back/Forward it restores the PAGE too,
 * from its client cache. So the header's Discuss item, and a cached page's forum controls ("Discuss this
 * version", a redacted post's old text), could outlive a switch-off or a redaction. The first fix
 * refreshed the whole route after every soft URL change: correct, but one extra server render per click.
 *
 *   - **Back/Forward (history traversal)** restores a cached page, which may be out of date in ways no summary
 *     can see: a redaction, new replies. So it always refreshes, as before.
 *   - **An ordinary navigation** renders a dynamic page fresh from the server; only the retained layout
 *     can be stale. So it asks `GET /api/discussion-topics/nav-state` for what the nav shows, and
 *     refreshes only when that differs from what the layout was rendered with.
 *   - ⚑ **Unknown counts as changed** (GPT review 2026-10-11): a failed check, an unreadable answer, or
 *     one that takes longer than `timeoutMs` (the request AND reading its body) refreshes, so a
 *     switch-off is never missed to save a request. A check cancelled by a newer navigation does
 *     nothing; that navigation runs its own.
 *
 * Nothing on arrival, nothing for an unchanged URL (including the refresh itself), no polling. The dot
 * catches up on the next navigation, never while idle (§16.1).
 */
import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export interface NavState {
  forumEnabled: boolean
  unread: boolean
}

/** How long a check may take before it is treated as unknown — and so as changed. */
export const NAV_CHECK_TIMEOUT_MS = 5_000

const TIMED_OUT = Symbol('timed out')

export default function NavigationFreshness({
  rendered,
  timeoutMs = NAV_CHECK_TIMEOUT_MS,
}: {
  rendered: NavState
  timeoutMs?: number
}) {
  const router = useRouter()
  const route = `${usePathname()}?${useSearchParams().toString()}`
  const previous = useRef(route)
  // What the CURRENT layout render shows. A refresh re-renders the layout and updates it.
  const shown = useRef(rendered)
  useEffect(() => {
    shown.current = rendered
  }, [rendered])

  // Set by the browser's history traversal, read by the route change it causes.
  // ⚑ HEARD BEFORE THE RENDER, NOT ON `popstate` (e2e, 2026-10-11). Observed in Chromium with Next 16:
  // Back fires the Navigation API's `navigate` (traverse), then React renders the restored route and
  // runs this component's route effect, and only THEN dispatches `popstate` — so a `popstate` listener,
  // even a capturing one registered first, set the flag too late. The effect saw no traversal, ran only
  // the nav check (which a redaction does not change), and Back showed the redacted text. `navigate`
  // precedes all of it. A capturing `popstate` listener remains for a browser without the API.
  const traversed = useRef(false)
  useEffect(() => {
    const onTraverse = () => {
      traversed.current = true
    }
    const onNavigate = (event: Event) => {
      if ((event as Event & { navigationType?: string }).navigationType === 'traverse') onTraverse()
    }
    const navigation = (window as Window & { navigation?: EventTarget }).navigation
    navigation?.addEventListener('navigate', onNavigate)
    window.addEventListener('popstate', onTraverse, { capture: true })
    return () => {
      navigation?.removeEventListener('navigate', onNavigate)
      window.removeEventListener('popstate', onTraverse, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (previous.current === route) return
    previous.current = route
    if (traversed.current) {
      traversed.current = false
      router.refresh()
      return
    }

    let cancelled = false
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
    })
    const check = (async (): Promise<boolean> => {
      const res = await fetch('/api/discussion-topics/nav-state', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      })
      const now = res.ok ? ((await res.json()) as Partial<NavState> | null) : null
      return (
        now == null ||
        now.forumEnabled !== shown.current.forumEnabled ||
        now.unread !== shown.current.unread
      )
    })()
    // If the deadline wins, the abandoned check rejects later (its request is aborted): handled here.
    check.catch(() => undefined)
    // The race covers the request AND the body read: a stalled body never reaches a resolution.
    Promise.race([check, deadline])
      .then((changed) => {
        if (!cancelled && changed !== false) router.refresh()
      })
      .catch(() => {
        if (!cancelled) router.refresh()
      })
      .finally(() => {
        clearTimeout(timer)
        controller.abort()
      })
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [route, router, timeoutMs])

  return null
}
