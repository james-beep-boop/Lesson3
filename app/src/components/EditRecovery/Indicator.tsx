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
 *
 * ⚑ LIVE STATUS ONLY. It used to carry a second line for admins — "Prose only — structural changes
 * and answer keys are not backed up" — which is a STATIC RULE, identical every render and about the
 * feature rather than about this session. Stacked in the control bar's flex row it doubled the
 * block's height and, at intermediate widths, squeezed the whole thing to one word per line. The
 * rule now lives in *Help* beside the other behaviour rules; what stays here is the only
 * text that changes, and therefore the only text that has to be on screen.
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

export function EditRecoveryIndicator({ status }: { status: RecoveryStatus }) {
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
        // ⚑ NEUTRAL about the cause, deliberately. The server collapses several states into one
        // undifferentiated 409 — a newer capture, a superseded session, a retired row — precisely so
        // it cannot leak whether another session exists. "Another tab" would be a guess dressed as a
        // fact, and wrong whenever the real cause was a reactivated session. PR 2b's reconciling GET
        // is what makes specifics honest.
        return ['warn', 'Backup is out of date — reload before saving']
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
    </div>
  )
}
