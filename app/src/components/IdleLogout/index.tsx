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
 * (`providers/Auth/index.js`): `logOut` POSTs `/<collection>/logout` and clears the in-memory user
 * — nothing more. The `router.replace()` lives in `redirectToInactivityRoute()`, which only
 * Payload's OWN `forceLogOutTimeout` calls. This docstring previously claimed "logout + redirect",
 * and that one false half sent a reviewer looking for the work-destroying path here, where it
 * isn't. The two expiry paths are genuinely different failures and need different fixes:
 *
 *   - Payload's `forceLogOutTimeout` (a single `setTimeout` at the deadline) → `revokeTokenAndExpire()`
 *     + `redirectToInactivityRoute()` → `router.replace()`. That UNMOUNTS the editor and DESTROYS
 *     unsaved work: Payload's dirty-form guard (`usePreventLeave`) hooks only `beforeunload` and a
 *     document click listener, so it never sees a programmatic navigation. Because it is `replace`,
 *     the page also leaves history, so Back cannot recover it.
 *   - THIS component → `logOut()`, no navigation, so the editor stays mounted: a ZOMBIE EDITOR with
 *     the work still on screen, the session dead, and every save 401ing. On the shared school
 *     machines this deployment targets (SPEC §13) that is also a privacy exposure — the next person
 *     at the keyboard, possibly a student, sees the previous teacher's content.
 *
 * BOTH are open, tracked gaps against the SPEC §5 durability invariant ("in-progress edits must
 * survive session expiry, browser crash, forced refresh, device sleep and accidental tab close"),
 * whose fix is server-side **edit recovery** — designed in `docs/DESIGN-working-drafts.md` (the file
 * keeps its historical name; the feature does not, because `draft` is a reserved word: SPEC §13). The rule
 * that design settles is *capture the working copy, then clear the screen*: clearing at expiry is
 * itself the privacy control, so the answer is never "stop unmounting", and this path must learn to
 * clear rather than linger.
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
