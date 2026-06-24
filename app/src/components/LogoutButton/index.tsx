'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

/**
 * Shared "Log out" button — used by both the frontend header and the admin header (one logout
 * everywhere). Clears the shared auth cookie and goes to the single login page. Styled per surface
 * via the `.link-button` class (frontend tokens / admin theme vars).
 */
export function LogoutButton() {
  const router = useRouter()
  const onLogout = async () => {
    try {
      await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Ignore network errors — navigate away regardless so a failed request can't strand the
      // user on a protected page. (If the cookie somehow survived, /login bounces back to /,
      // which is the correct still-authenticated behavior.)
    } finally {
      router.replace('/login')
      router.refresh()
    }
  }
  return (
    <button type="button" className="link-button" onClick={onLogout}>
      Log out
    </button>
  )
}
