'use client'

/** The pieces both composers share: a labelled field with its hint, and the submit / Try again row. */
import React, { useId } from 'react'

import type { ComposerPhase } from '@/lib/discussionComposer'

export const PLAIN_TEXT_HINT = 'Plain text. Web links become clickable.'

/**
 * A labelled field with a hint. ⚑ The hint is NOT inside the `<label>`: there it became part of the
 * field's accessible name ("Post Plain text. Web links become clickable."), which a screen reader reads as
 * the name and which no `getByLabel('Post')` could find. It is a DESCRIPTION, so it is attached with
 * `aria-describedby`.
 */
export function ComposerField({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: (ids: { id: string; 'aria-describedby': string }) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className="disc-compose__field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': `${id}-hint` })}
      <span id={`${id}-hint`} className="disc-compose__hint">
        {hint}
      </span>
    </div>
  )
}

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
