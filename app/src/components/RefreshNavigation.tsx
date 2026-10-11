'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Next retains the shared layout during soft navigation. Refresh once after a URL change so its
 * forum switch and unread state catch up. No initial refresh, polling or refresh loop; unchanged
 * URLs (including the refresh itself) do nothing. Client form state survives router.refresh().
 */
export default function RefreshNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const route = `${pathname}?${search}`
  const previous = useRef(route)
  useEffect(() => {
    if (previous.current === route) return
    previous.current = route
    router.refresh()
  }, [route, router])
  return null
}
