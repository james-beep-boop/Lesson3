'use client'

/**
 * Live search for the library. The list is filtered server-side by `?q=` (see page.tsx). This box
 * keeps the query in the URL as you type — a short debounce then `router.replace('/?q=…')`, which
 * soft-re-renders the server list without a full reload or losing input focus. Enter submits
 * immediately. It's still a real GET `<form>`, so it also works with JavaScript disabled (plain
 * submit navigates to `/?q=…`).
 */
import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const DEBOUNCE_MS = 200

export default function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const navigate = (q: string) => {
    const trimmed = q.trim()
    router.replace(trimmed ? `/?q=${encodeURIComponent(trimmed)}` : '/', { scroll: false })
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
