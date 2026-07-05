'use client'

import React, { useSyncExternalStore } from 'react'
import { useFormFields } from '@payloadcms/ui'

/**
 * Sidebar display of the version's Last Modified / Created timestamps (UI field, no DB column).
 * Relocates what Payload natively shows in the document-controls row; that native row is hidden for
 * this collection in `(payload)/custom.scss`. Reads the values straight from the form state.
 *
 * TWO-PASS RENDERING (fix 2026-07-05, see DECISIONS): a user-local `toLocaleString(undefined, …)`
 * depends on the runtime's timezone+locale, so the server pass (container TZ — UTC on docker/the
 * Rock) and a browser in another zone produced different text → React #418 + a full client
 * re-render on every version-document load. (`suppressHydrationWarning` was tried first: React 19
 * KEEPS the server text, so non-UTC readers silently saw UTC times — verified by browser A/B.)
 * Instead, the server pass and the hydration render both use a deterministic string — explicit
 * locale AND explicit UTC, so the trees match byte-for-byte by construction — and the first
 * post-hydration render swaps in the reader's true local rendering. Non-UTC readers see the
 * UTC-labelled value only for the pre-hydration blink.
 */
const fmt = (v: unknown, local: boolean): string => {
  if (typeof v !== 'string' && typeof v !== 'number') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return local
    ? d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
    : `${d.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' })} UTC`
}

export default function VersionTimestamps() {
  // Select each scalar separately: `useFormFields` is `useContextSelector`, which re-renders on
  // Object.is inequality — returning a fresh `{...}` object would re-render on every keystroke in the
  // form. Two primitive selectors only re-render when a timestamp's value actually changes.
  const updatedAt = useFormFields(([fields]) => fields?.updatedAt?.value)
  const createdAt = useFormFields(([fields]) => fields?.createdAt?.value)

  // The canonical "is hydrated" primitive: the server snapshot (false) drives the server pass AND
  // the hydration render, so the trees match; React then re-renders with the client snapshot
  // (true) — the earliest hydration-safe point for client-only values. No effect/setState, so no
  // cascading-render lint and one fewer render than the mount-effect pattern.
  const local = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  return (
    <div className="version-timestamps">
      <div className="version-timestamps__row">
        <span className="version-timestamps__label">Last Modified</span>
        <span className="version-timestamps__value">{fmt(updatedAt, local)}</span>
      </div>
      <div className="version-timestamps__row">
        <span className="version-timestamps__label">Created</span>
        <span className="version-timestamps__value">{fmt(createdAt, local)}</span>
      </div>
    </div>
  )
}
