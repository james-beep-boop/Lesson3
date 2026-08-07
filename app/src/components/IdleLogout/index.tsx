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
 *
 * ⚑ **It also HOSTS the edit-recovery flush registry**, and that is deliberate rather than incidental.
 * The pre-expiry flush (design §5) needs code that lives in the editor — the live capture token, the
 * in-flight write, the current form snapshot — but the deadline is known only here. Making this
 * component the provider means ONE component owns the deadline and the thing to do before it, and
 * removes any question about the ordering of two separate providers in `admin.components.providers`.
 * The editor registers on mount and unregisters on unmount; see `EditRecovery/flushRegistry`.
 */
import React, { useEffect, useRef } from 'react'
import { useAuth } from '@payloadcms/ui'

import {
  EditRecoveryFlushProvider,
  useEditRecoveryFlushRegistry,
} from '../EditRecovery/flushRegistry'

const CHECK_INTERVAL_MS = 30_000

/**
 * How far ahead of the deadline to flush unsaved work.
 *
 * ⚑ Comfortably longer than {@link CHECK_INTERVAL_MS}, because this fires from the same interval: a
 * lead shorter than the polling period could fall entirely between two ticks and never run at all.
 * It also has to leave the capture time to complete while the token is still VALID — a flush that
 * starts at the deadline is a flush that 401s.
 */
const FLUSH_LEAD_MS = 90_000

export default function IdleLogout({ children }: { children?: React.ReactNode }) {
  return (
    <EditRecoveryFlushProvider>
      <IdleLogoutInner>{children}</IdleLogoutInner>
    </EditRecoveryFlushProvider>
  )
}

/** Split out so it can consume the registry its parent provides. */
function IdleLogoutInner({ children }: { children?: React.ReactNode }) {
  const { user, tokenExpirationMs, logOut } = useAuth()
  const { runAll } = useEditRecoveryFlushRegistry()
  const flushed = useRef(false)

  useEffect(() => {
    if (!user || !tokenExpirationMs) return

    // A new deadline (Payload refreshed the token, e.g. "Stay logged in") is a new session for this
    // purpose, so the pre-expiry flush is armed again.
    flushed.current = false

    let loggingOut = false
    const check = () => {
      if (loggingOut) return
      // ⚑ BEFORE the expiry branch: once the deadline passes, the token is gone and a capture would
      // 401. This is the last moment the work can still be saved.
      if (!flushed.current && Date.now() >= tokenExpirationMs - FLUSH_LEAD_MS) {
        flushed.current = true
        void runAll()
      }
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
  }, [user, tokenExpirationMs, logOut, runAll])

  return <>{children}</>
}
