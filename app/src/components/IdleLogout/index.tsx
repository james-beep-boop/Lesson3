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
 * So this component USED TO leave a ZOMBIE EDITOR: work on screen, session dead, every save 401ing —
 * and on the shared school machines this deployment targets (SPEC §13), the next person at the keyboard
 * saw the previous teacher's content. Payload's own timeout is the separate path that unmounts and
 * destroys unsaved work. Both were open gaps against the SPEC §5 durability invariant; the two
 * mechanisms are analysed in `docs/DESIGN-working-drafts.md` §1 — kept there rather than restated here,
 * so the two cannot drift apart.
 *
 * ⚑ **This component now CLEARS THE SCREEN at the deadline, but only when the work is provably safe.**
 * That conditional is the whole design, not caution: clearing an editor whose capture never landed
 * would make this component the thing that destroys unsaved work, which is precisely the failure the
 * recovery feature exists to prevent. So the in-window flushes report a verdict (see
 * `flushRegistry`'s `PreExpiryFlush`) and only an unbroken `true` earns the redirect. When anything is
 * unproven — a refused capture, a flush still in flight, no provider at all — the old zombie editor is
 * deliberately preserved: the session is dead either way, and leaving the work legible on screen is the
 * lesser harm, because the teacher can still select and copy it.
 *
 * Mounted via admin.components.providers, so it's always present and (per Payload's provider
 * tree) rendered inside AuthProvider. It renders its children unchanged.
 *
 * ⚑ **It also HOSTS the edit-recovery flush registry**, and that is deliberate rather than incidental.
 * The pre-expiry flush (design §5) needs code that lives in the editor — the live capture token, the
 * in-flight write, the current form snapshot — but the deadline is known only here. Making this
 * component the provider means ONE component owns the deadline and the thing to do before it.
 *
 * ⚑ The reason is not that provider order is ambiguous — it is fully determined (`providers[0]` is
 * outermost). It is that getting it wrong fails SILENTLY: a mis-ordered array leaves this component
 * consuming the registry's no-op default, the pre-expiry flush never runs, and nothing reports it.
 * The editor registers on mount and unregisters on unmount; see `EditRecovery/flushRegistry`.
 */
import React, { useEffect, useRef } from 'react'
import { useAuth } from '@payloadcms/ui'

import { EditRecoveryFlushProvider, useFlushRegistry } from '../EditRecovery/flushRegistry'

const CHECK_INTERVAL_MS = 30_000

/**
 * How far ahead of the deadline to flush unsaved work.
 *
 * ⚑ **DERIVED from {@link CHECK_INTERVAL_MS} rather than merely documented as larger than it.** This
 * fires from that same interval, so a lead shorter than the polling period can fall entirely between
 * two ticks and never run — and the symptom is silence: no type error, no failing test, the headline
 * §5 guarantee just quietly becomes a no-op. Someone raising the poll interval for battery reasons
 * has no reason to connect it to edit recovery, so the relationship is enforced here instead of
 * trusted. It also has to leave the capture time to finish while the token is still VALID: a flush
 * that starts at the deadline is a flush that 401s.
 */
const FLUSH_LEAD_MS = Math.max(90_000, CHECK_INTERVAL_MS * 3)

/**
 * Payload's own post-inactivity destination — `admin.routes.inactivity`, which
 * `payload/dist/config/defaults` defaults to `/logout-inactivity` and this project does not override.
 * A real view, so the redirect lands somewhere that explains itself rather than on a bare login form,
 * and the `redirect` param is the shape Payload's own `redirectToInactivityRoute` uses, so signing
 * back in returns the user to the document they were editing.
 *
 * ⚑ Hardcoded because it is read from a plain `useEffect`, outside the config. If `admin.routes` ever
 * gains an override, this constant is the thing that has to move with it.
 */
const INACTIVITY_ROUTE = '/admin/logout-inactivity'

export default function IdleLogout({ children }: { children?: React.ReactNode }) {
  const { user, tokenExpirationMs, logOut } = useAuth()
  // Owned here, not consumed from a parent — so no inner component is needed just to read what this
  // one provides.
  const registry = useFlushRegistry()
  const { runAll } = registry

  /**
   * Whether the most recent in-window flush confirmed every editor's work is stored.
   *
   * ⚑ Starts FALSE and is only ever set by a completed flush. At the deadline we cannot ask — the
   * token is dead — so the screen clears on this remembered answer, and the safe default for
   * "no flush has completed yet" is to leave the work on screen.
   */
  const workIsSafe = useRef(false)

  useEffect(() => {
    if (!user || !tokenExpirationMs) return

    let loggingOut = false
    // ⚑ A flush still in flight means the verdict in `workIsSafe` belongs to an EARLIER tick, and the
    // user may have typed since. Treated as unproven rather than trusted.
    let flushing = false

    const check = () => {
      if (loggingOut) return
      const now = Date.now()

      if (now >= tokenExpirationMs) {
        loggingOut = true
        // ⚑ The flush is NOT retried here. The token is already dead, so a capture would 401; the
        // work that survives is whatever the in-window flushes below already stored. Firing one
        // last request alongside `logOut` would only race the logout and fail.
        const clearScreen = workIsSafe.current && !flushing
        void logOut().then(() => {
          // ⚑ A HARD navigation, not `router.replace`. The point is that nothing of the previous
          // teacher's document survives on a shared machine, and a soft transition keeps the whole
          // React tree — including the form state we are trying to remove — alive in memory. This is
          // also why it runs after `logOut()` resolves: navigating first would abandon the logout
          // request and leave a live session cookie behind.
          if (clearScreen) {
            const path = window.location.pathname
            window.location.replace(`${INACTIVITY_ROUTE}?redirect=${encodeURIComponent(path)}`)
          }
        })
        return
      }

      // ⚑ Runs on EVERY tick inside the window, not once. Two defects in the one-shot version:
      // an editor that registers AFTER the window opens found the single attempt already spent on
      // an empty registry, and anything typed after that attempt had no final flush at all — the
      // guarantee held only for work that happened to exist at one instant 90 seconds out. Repeating
      // is cheap: a flush with nothing dirty to send is a no-op inside the editor's own guard.
      if (now >= tokenExpirationMs - FLUSH_LEAD_MS) {
        flushing = true
        void runAll()
          .then((safe) => {
            workIsSafe.current = safe
          })
          .catch(() => {
            workIsSafe.current = false
          })
          .finally(() => {
            flushing = false
          })
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

  return <EditRecoveryFlushProvider registry={registry}>{children}</EditRecoveryFlushProvider>
}
