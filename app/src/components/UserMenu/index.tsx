'use client'

import React, { useEffect, useRef, useState } from 'react'

import { initials } from '../../lib/initials'

/**
 * Top-right user menu — the two-letter initials avatar that opens a small dropdown:
 *   line 1: the user's role type (Teacher / Editor / Subject Administrator / Site Administrator)
 *   line 2: the login name (email)
 *   line 3: "Messages" (with the unread count) — moved here from the top nav
 *   line 4: "Log Out"
 *
 * Shared by BOTH surfaces (frontend header + admin header) so they match exactly; each surface only
 * supplies the theme colors for the shared `.user-menu*` classes. Logout clears the shared auth cookie
 * and does a full navigation to the single login page (surface-agnostic — works from / and /admin).
 * A small unread badge sits on the avatar itself so a waiting message is visible without opening it.
 */
export function UserMenu({
  typeLabel,
  displayName,
  loginName,
  unread,
}: {
  typeLabel: string
  /** Source for the two-letter avatar (the user's name). */
  displayName: string
  /** Shown as line 2 of the dropdown — the email they sign in with. */
  loginName: string
  /** Unread message count — badges the avatar and the Messages item (0 hides both). */
  unread: number
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
        aria-label={unread > 0 ? `Account menu, ${unread} unread messages` : 'Account menu'}
        title={loginName}
        onClick={() => setOpen((o) => !o)}
      >
        {initials(displayName)}
        {unread > 0 && <span className="user-menu__avatar-badge" aria-hidden="true">{unread}</span>}
      </button>
      {open && (
        <div className="user-menu__dropdown" role="menu">
          <div className="user-menu__type">{typeLabel}</div>
          <div className="user-menu__name">{loginName}</div>
          {/* Cross-surface (admin → frontend) → a plain <a>, like the rest of the nav. */}
          <a className="user-menu__item" role="menuitem" href="/messages">
            Messages
            {unread > 0 && <span className="user-menu__badge">{unread}</span>}
          </a>
          <button type="button" className="user-menu__logout" role="menuitem" onClick={onLogout}>
            Log Out
          </button>
        </div>
      )}
    </div>
  )
}
