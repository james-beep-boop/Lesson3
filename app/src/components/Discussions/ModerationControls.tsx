'use client'

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { wireErrorMessage } from '@/lib/wireError'
import Modal from '../Modal'

type Target =
  | { kind: 'topic'; id: number; titleRemoved: boolean; pinned: boolean; forumEnabled: boolean }
  | { kind: 'reply'; id: number }
type Action = 'pin' | 'redact' | 'delete'

/** All writes use the existing moderation endpoints, never ordinary REST updates. */
export default function ModerationControls({
  target,
  bodyRemoved,
}: {
  target: Target
  bodyRemoved: boolean
}) {
  const router = useRouter()
  const inFlight = useRef(false)
  const [action, setAction] = useState<Action | null>(null)
  const [title, setTitle] = useState(false)
  const [body, setBody] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const topic = target.kind === 'topic' ? target : null
  const pinLabel = topic?.pinned ? 'Unpin' : 'Pin'
  const label = action === 'pin' ? pinLabel : action === 'delete' ? 'Delete thread' : 'Redact'
  const destructive = action === 'redact' || action === 'delete'
  const canRedact = !bodyRemoved || (topic != null && !topic.titleRemoved)

  const open = (next: Action) => {
    setTitle(false)
    setBody(false)
    setError(null)
    setAction(next)
  }

  const confirm = async () => {
    if (!action || inFlight.current || uncertain) return
    if (action === 'redact' && topic && !title && !body) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/discussion-${topic ? 'topics' : 'replies'}/${target.id}/${action}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            action === 'pin'
              ? { pinned: !topic?.pinned }
              : action === 'redact' && topic
                ? { ...(title ? { title: true } : {}), ...(body ? { body: true } : {}) }
                : {},
          ),
          signal: AbortSignal.timeout(30_000),
        },
      )
      if (!response.ok) {
        setError(await wireErrorMessage(response, 'Could not complete this action'))
        // A server failure can follow a committed write. Re-read before attempting another action.
        if (response.status >= 500) setUncertain(true)
        return
      }
      setAction(null)
      if (action === 'delete') router.push('/discuss')
      else router.refresh()
    } catch {
      setUncertain(true)
      setError('We could not confirm the result. Reload to see what changed before trying again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div
      className="disc-moderation"
      role="group"
      aria-label={topic ? 'Thread moderation' : 'Reply moderation'}
    >
      {topic?.forumEnabled && (
        <button
          type="button"
          className="btn btn--quiet"
          disabled={busy || uncertain}
          onClick={() => open('pin')}
        >
          {pinLabel}
        </button>
      )}
      {canRedact && (
        <button
          type="button"
          className="btn btn--quiet"
          disabled={busy || uncertain}
          onClick={() => open('redact')}
        >
          {topic ? 'Redact topic' : 'Redact reply'}
        </button>
      )}
      {topic && (
        <button
          type="button"
          className="btn btn--danger"
          disabled={busy || uncertain}
          onClick={() => open('delete')}
        >
          Delete thread
        </button>
      )}
      {uncertain && !action && (
        <>
          <p className="inline-error" role="alert">
            {error}
          </p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </>
      )}
      {action && (
        <Modal
          title={label}
          onClose={() => {
            if (!inFlight.current) setAction(null)
          }}
        >
          <form
            className="modal__form"
            onSubmit={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            <p className="modal__body">
              {action === 'pin'
                ? `${pinLabel} this discussion?`
                : action === 'delete'
                  ? 'Delete this entire thread and every reply? This cannot be undone.'
                  : 'Remove the selected text permanently? This cannot be undone. Existing backups keep the text until they age out.'}
            </p>
            {action === 'redact' && topic && (
              <fieldset disabled={busy || uncertain} className="disc-redact-options">
                <legend>Text to remove</legend>
                {!topic.titleRemoved && (
                  <label>
                    <input
                      type="checkbox"
                      checked={title}
                      onChange={(event) => setTitle(event.target.checked)}
                    />{' '}
                    Title
                  </label>
                )}
                {!bodyRemoved && (
                  <label>
                    <input
                      type="checkbox"
                      checked={body}
                      onChange={(event) => setBody(event.target.checked)}
                    />{' '}
                    Opening post
                  </label>
                )}
              </fieldset>
            )}
            {action === 'redact' && !topic && <p>Remove this reply’s text.</p>}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal__actions">
              <button type="button" className="btn" disabled={busy} onClick={() => setAction(null)}>
                Cancel
              </button>
              {uncertain ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              ) : (
                <button
                  type="submit"
                  className={destructive ? 'btn btn--danger' : 'btn btn--primary'}
                  disabled={busy || (action === 'redact' && !!topic && !title && !body)}
                  aria-busy={busy}
                >
                  {busy ? 'Working…' : label}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
