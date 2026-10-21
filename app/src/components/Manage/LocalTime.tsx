'use client'

import React, { useSyncExternalStore } from 'react'

/**
 * An instant in the VIEWER's local time — "today, 2:00 AM (your time)" — for the Backups statements.
 *
 * A server render cannot know the viewer's zone, so this uses the same two-pass rendering as
 * `VersionTimestamps` (DECISIONS 2026-07-05): the server pass and the hydration render print an
 * explicit-UTC string, so the trees match byte for byte, and the first post-hydration render swaps in
 * the local one. Non-UTC readers see the UTC-labelled value only for the pre-hydration blink.
 */
export function formatInstant(iso: string, local: boolean, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  if (!local) {
    return `${date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`
  }
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(date)) / 86_400_000)
  const when =
    days === 0
      ? 'today'
      : days === 1
        ? 'yesterday'
        : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${when}, ${time} (your time)`
}

export function LocalTime({ at }: { at: string }) {
  const local = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  return <time dateTime={at}>{formatInstant(at, local)}</time>
}
