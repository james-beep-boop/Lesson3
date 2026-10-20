'use client'

/**
 * The wrong-clock warning on Manage, for Site Administrators (2026-10-19). Wording: operator-approved
 * per Codex's revision — either clock could be the wrong one, so it names both.
 *
 * Checks ONCE, when it appears, against a FRESH server reading (`/api/server-time`), never a timestamp
 * baked into the page. It never re-checks while the page stays open, so a frozen reading can never be
 * compared with a ticking device clock. Any failure shows nothing: this is advice, not a gate.
 */
import React, { useEffect, useState } from 'react'
import { useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
import { clocksDisagree } from '../../lib/clockSkew'

const show = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function ClockCheck() {
  const { config } = useConfig()
  const apiBase = apiBaseFrom(config)
  const [mismatch, setMismatch] = useState<{ server: number; device: number } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const sent = Date.now()
        const response = await fetch(`${apiBase}/server-time`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const { now } = (await response.json()) as { now?: unknown }
        const device = Math.round((sent + Date.now()) / 2)
        if (typeof now === 'number' && clocksDisagree(now, device))
          setMismatch({ server: now, device })
      } catch {
        // Advice only: a failed check must not put anything on screen.
      }
    })()
    return () => controller.abort()
    // Once per appearance, deliberately: re-running on any change would re-compare later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!mismatch) return null
  return (
    <section className="lp-manage__clock" role="alert" aria-labelledby="lp-clock-heading">
      <h2 id="lp-clock-heading" className="lp-manage__clock-title">
        The server and this device show different times.
      </h2>
      <p className="lp-manage__desc">
        Server: {show(mismatch.server)}. This device: {show(mismatch.device)}. Saved dates, draft
        expiry and sign-in timeouts depend on the server’s clock. Ask whoever looks after the server
        to check its date and time. This device’s clock may also need checking.
      </p>
    </section>
  )
}
