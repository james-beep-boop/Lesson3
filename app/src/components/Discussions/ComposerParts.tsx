'use client'

/** The discussion-specific submit / Try again row. Fields use the shared FormField. */
import React from 'react'

import type { ComposerPhase } from '@/lib/discussionComposer'

export const PLAIN_TEXT_HINT = 'Plain text. Web links become clickable.'

/** Post / Posting… / Try again, and the last attempt's message. Shared by both composers. */
export function ComposerActions({
  phase,
  message,
  submitLabel,
  canSubmit,
  onRetry,
}: {
  phase: ComposerPhase
  message: string | null
  submitLabel: string
  canSubmit: boolean
  onRetry: () => void
}) {
  // An unknown outcome is a NOTE, not an error: the post may well have landed.
  const noteClass = phase === 'uncertain' ? 'disc-compose__note' : 'inline-error'
  return (
    <div className="disc-compose__actions">
      {phase === 'uncertain' ? (
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Try again
        </button>
      ) : (
        <button
          type="submit"
          className="btn btn--primary"
          disabled={phase === 'sending' || !canSubmit}
          aria-busy={phase === 'sending'}
        >
          {phase === 'sending' ? 'Posting…' : submitLabel}
        </button>
      )}
      {message && (
        <span className={noteClass} role="status">
          {message}
        </span>
      )}
    </div>
  )
}
