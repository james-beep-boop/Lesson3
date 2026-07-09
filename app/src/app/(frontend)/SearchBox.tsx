'use client'

/**
 * Live search for the library. The list is filtered server-side by `?q=` (see page.tsx). This box
 * keeps the query in the URL as you type — a short debounce then `router.replace('/?q=…')`, which
 * soft-re-renders the server list without a full reload or losing input focus. Enter submits
 * immediately. It's still a real GET `<form>`, so it also works with JavaScript disabled (plain
 * submit navigates to `/?q=…`).
 */
import React, { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const DEBOUNCE_MS = 200

export default function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The trimmed query this box itself last pushed to the URL. Distinguishes our own `?q=` round
  // trip (the server re-render echoing what we just navigated to) from an EXTERNAL navigation
  // (some other link changing or clearing `q`) — only the latter should re-sync the input.
  const lastNavigated = useRef(initialQuery)

  // Re-sync the input when `initialQuery` changes from OUTSIDE this component. Our own
  // navigation's echo is deliberately ignored: adopting it would revert keystrokes typed while
  // that request was in flight. An external change also cancels any pending debounce, so a stale
  // timer can't immediately navigate back to the query the user just left. (An effect, not the
  // adjust-state-during-render pattern, because it touches refs — the paint-later sync is
  // imperceptible for a navigation-driven change.)
  useEffect(() => {
    if (initialQuery !== lastNavigated.current) {
      lastNavigated.current = initialQuery
      clearTimeout(timer.current)
      setValue(initialQuery)
    }
  }, [initialQuery])

  const navigate = (q: string) => {
    const trimmed = q.trim()
    lastNavigated.current = trimmed
    // Merge with the current params so typing a query keeps the T2 subject/grade filter chips.
    const p = new URLSearchParams(searchParams.toString())
    if (trimmed) p.set('q', trimmed)
    else p.delete('q')
    const qs = p.toString()
    router.replace(qs ? `/?${qs}` : '/', { scroll: false })
  }

  const onChange = (q: string) => {
    setValue(q)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => navigate(q), DEBOUNCE_MS)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault() // Enter → filter now, don't fall through to a full-page GET.
    clearTimeout(timer.current)
    navigate(value)
  }

  // A pending debounce must not outlive the box: `navigate` drives the GLOBAL Next router, so a
  // timer firing after the user clicked into a lesson would yank them back to `/?q=…`.
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <form className="lp-search" method="get" action="/" role="search" onSubmit={onSubmit}>
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search lesson plans"
        aria-label="Search lesson plans"
      />
    </form>
  )
}
