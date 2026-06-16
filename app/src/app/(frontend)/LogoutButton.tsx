'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()
  const onLogout = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    router.replace('/login')
    router.refresh()
  }
  return (
    <button type="button" className="link-button" onClick={onLogout}>
      Log out
    </button>
  )
}
