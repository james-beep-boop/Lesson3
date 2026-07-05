'use client'

/**
 * Fires the mark-read POST for the inbox messages the server just rendered (SPEC §10; Codex #4).
 * Read-state is a state-changing POST — NOT a GET-render write — so it's CSRF-safe for every browser
 * (the SameSite=Lax auth cookie isn't sent on a cross-site POST). Preserves the "viewing is reading"
 * UX: the server render still shows the "New" tags this visit; this clears them for the next load.
 *
 * Fire-and-forget on mount, no router.refresh(): re-rendering now would flash the "New" tags away
 * mid-view and the AppNav badge clears on the next navigation anyway (unchanged from before). Renders
 * nothing. `ids` is the set of unread messages actually shown (scoping preserved from the old write).
 */
import { useEffect, useRef } from 'react'

export default function MarkShownRead({ ids }: { ids: number[] }) {
  // Guard against a double-fire in React 18 StrictMode dev remount; harmless if it did (idempotent).
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current || ids.length === 0) return
    fired.current = true
    void fetch('/api/messages/mark-read', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {
      // Best-effort: a failed mark-read just leaves them unread; the next view retries.
    })
  }, [ids])
  return null
}
