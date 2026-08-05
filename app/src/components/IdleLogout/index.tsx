'use client'

/**
 * IdleLogout — a reliable wall-clock backstop for admin session expiry.
 *
 * Payload's built-in auto-logout is a single `setTimeout` scheduled for the token deadline;
 * browsers throttle/suspend timers in backgrounded or slept tabs, so an idle session can
 * linger on screen well past `tokenExpiration` (the server still rejects it on the next
 * request, but the tab doesn't proactively clear itself). This provider adds a dependable
 * check that does NOT rely on a single timer:
 *   - a short interval (so a focused-but-idle tab logs out within ~30s of the deadline),
 *   - plus `focus` / `visibilitychange` (so returning to a backgrounded/slept tab logs out
 *     immediately if the deadline already passed).
 *
 * It uses Payload's own auth context: `tokenExpirationMs` is the live deadline (Payload moves
 * it forward whenever the token is refreshed — e.g. the user clicks "Stay logged in" or stays
 * active), and `logOut()` performs the real server logout. So this never logs out an active
 * user; it only enforces the deadline a stale tab would otherwise ignore.
 *
 * ⚑ `logOut()` DOES NOT NAVIGATE. Verified in installed @payloadcms/ui 3.85.1
 * (`providers/Auth/index.js`): it POSTs `/<collection>/logout` and clears the in-memory user, nothing
 * more. The `router.replace()` belongs to `redirectToInactivityRoute()`, which only Payload's OWN
 * `forceLogOutTimeout` calls. This docstring used to claim "logout + redirect", and that one false
 * half sent a reviewer hunting the work-destroying path here, where it is not.
 *
 * So this component leaves a ZOMBIE EDITOR: work on screen, session dead, every save 401ing — and on
 * the shared school machines this deployment targets (SPEC §13), the next person at the keyboard sees
 * the previous teacher's content. Payload's own timeout is the separate path that unmounts and destroys
 * unsaved work. Both are open gaps against the SPEC §5 durability invariant; the two mechanisms, and
 * the fix (server-side edit recovery), are analysed in `docs/DESIGN-working-drafts.md` §1 — kept there
 * rather than restated here, so the two cannot drift apart.
 *
 * Mounted via admin.components.providers, so it's always present and (per Payload's provider
 * tree) rendered inside AuthProvider. It renders its children unchanged.
 */
import React, { useEffect } from 'react'
import { useAuth } from '@payloadcms/ui'

const CHECK_INTERVAL_MS = 30_000

export default function IdleLogout({ children }: { children?: React.ReactNode }) {
  const { user, tokenExpirationMs, logOut } = useAuth()

  useEffect(() => {
    if (!user || !tokenExpirationMs) return

    let loggingOut = false
    const check = () => {
      if (loggingOut) return
      if (Date.now() >= tokenExpirationMs) {
        loggingOut = true
        void logOut()
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }

    const interval = setInterval(check, CHECK_INTERVAL_MS)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisibility)
    check() // immediate: catches returning to a tab that was idle past the deadline

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user, tokenExpirationMs, logOut])

  return <>{children}</>
}
