'use client'

import React, { useEffect, useRef, useState } from 'react'

import { initials } from '../../lib/initials'

/**
 * Top-right user menu — the two-letter initials avatar that opens a small dropdown:
 *   line 1: the user's role type (Teacher / Editor / Subject Administrator / Site Administrator)
 *   line 2: the login name (email)
 *   line 3: "Log Out"
 *
 * Shared by BOTH surfaces (frontend header + admin header) so they match exactly; each surface only
 * supplies the theme colors for the shared `.user-menu*` classes. Logout clears the shared auth cookie
 * and does a full navigation to the single login page (surface-agnostic — works from / and /admin).
 */
export function UserMenu({
  typeLabel,
  displayName,
  loginName,
}: {
  typeLabel: string
  /** Source for the two-letter avatar (the user's name). */
  displayName: string
  /** Shown as line 2 of the dropdown — the email they sign in with. */
  loginName: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onLogout = async () => {
    try {
      await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Ignore network errors — navigate away regardless so a failed request can't strand the user.
    } finally {
      window.location.assign('/login')
    }
  }

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu__avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={loginName}
        onClick={() => setOpen((o) => !o)}
      >
        {initials(displayName)}
      </button>
      {open && (
        <div className="user-menu__dropdown" role="menu">
          <div className="user-menu__type">{typeLabel}</div>
          <div className="user-menu__name">{loginName}</div>
          <button type="button" className="user-menu__logout" role="menuitem" onClick={onLogout}>
            Log Out
          </button>
        </div>
      )}
    </div>
  )
}
