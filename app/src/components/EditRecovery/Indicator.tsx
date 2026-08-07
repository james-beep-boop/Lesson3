'use client'

/**
 * The edit-recovery indicator — what the teacher is told about their unsaved work.
 *
 * ⚑ **The timestamp IS the contract** (SPEC §5). This feature's promise is "your unsaved work is
 * backed up", and a promise the user cannot verify is worth nothing — so a failed capture must SAY
 * so rather than falling silent or, worse, leaving a stale "backed up" reading on screen. Every
 * failure branch here is visible text, and that is deliberate rather than thorough.
 *
 * Purely presentational: it takes a status and renders it. All protocol decisions live in
 * `protocol.ts` and all transport in `useEditRecovery`, so this file can never accidentally become a
 * second place where "did the backup work" is decided.
 */
import React, { useEffect, useState } from 'react'

import type { RecoveryStatus } from './protocol'

/**
 * How often the "· 12 s ago" reading re-renders.
 *
 * ⚑ The tick exists because a FROZEN timestamp is worse than none: "backed up · 12 s ago" still
 * reading 12 s after five minutes of typing tells the user their work is safer than it is. It runs
 * only while something is actually being reported.
 */
const TICK_MS = 10_000

/** Coarse on purpose — this answers "recently?", not "exactly when?". */
const ago = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)}h ago`
}

export function EditRecoveryIndicator({
  status,
  /** True for admins, whose structural and answer-key edits are NOT covered (design §3, v1 is prose-only). */
  structuralEditsUncovered,
}: {
  status: RecoveryStatus
  structuralEditsUncovered: boolean
}) {
  /**
   * ⚑ `now` is STATE fed by the interval, not `Date.now()` read during render — rendering must be
   * pure, and the lint enforces it. It starts at 0, so before the first tick `now - status.at` is
   * negative, clamps to zero and reads "just now": correct for a capture that has only just landed,
   * and it needs no reset when a later capture arrives.
   */
  const [now, setNow] = useState(0)
  const ticking = status.kind === 'backedUp'

  useEffect(() => {
    if (!ticking) return
    const t = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [ticking])

  if (status.kind === 'off') return null

  const [tone, text] = ((): ['ok' | 'warn' | 'muted', string] => {
    switch (status.kind) {
      case 'starting':
      case 'idle':
        return ['muted', 'Unsaved changes will be backed up']
      case 'saving':
        return ['muted', 'Backing up…']
      case 'backedUp':
        return ['ok', `Unsaved changes backed up · ${ago(now - status.at)}`]
      case 'conflict':
        // Not a failure of ours — a real second session. Named as such so the user knows the other
        // window is the thing to look at, not this one.
        return ['warn', 'Newer unsaved changes exist in another tab — reload before saving']
      case 'unavailable':
        return [
          'warn',
          status.reason === 'atCapacity'
            ? 'Backup unavailable: too many lesson plans open with unsaved changes'
            : 'Backup unavailable — your changes are not being saved automatically',
        ]
      case 'notBackedUp':
        switch (status.reason) {
          case 'tooLarge':
            return ['warn', 'NOT backed up: these changes are too large to back up']
          case 'rateLimited':
            return [
              'warn',
              `NOT backed up: retrying${
                status.retryAfterSec ? ` in ${status.retryAfterSec}s` : ' shortly'
              }`,
            ]
          case 'transport':
            return ['warn', 'NOT backed up: could not reach the server']
        }
    }
  })()

  return (
    <div
      className={`lp-recovery lp-recovery--${tone}`}
      // `status`, not `alert`: this updates on a timer and during typing, and an assertive live
      // region would interrupt a screen-reader user mid-sentence every time it did.
      role="status"
      aria-live="polite"
    >
      <span className="lp-recovery__text">{text}</span>
      {structuralEditsUncovered && (
        <span className="lp-recovery__scope">
          Prose only — structural changes and answer keys are not backed up
        </span>
      )}
    </div>
  )
}
