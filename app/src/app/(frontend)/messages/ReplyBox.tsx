'use client'

/**
 * Inline reply for an inbox message (SPEC §10). A "Reply" button expands the same kind of compose box
 * the top Composer uses, with the recipient fixed to the original sender (and the original lesson link
 * carried along, so the reply stays about the same lesson). POSTs Payload's default REST — `sender` is
 * stamped server-side, rate-limited — like Composer/FavoriteToggle. On success it refreshes the inbox.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import { sendMessage } from './sendMessage'

export default function ReplyBox({
  recipientId,
  recipientName,
  messageId,
}: {
  recipientId: number
  recipientName: string
  /** The original message is the server's authority for the inherited reference. */
  messageId: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSend = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendMessage({
        recipient: recipientId,
        body: body.trim(),
        replyTo: messageId,
      })
      setBody('')
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reply.')
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--compact" onClick={() => setOpen(true)}>
        Reply
      </button>
    )
  }

  return (
    <div className="msg-reply">
      <textarea
        className="msg-reply__body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder={`Reply to ${recipientName}…`}
        disabled={busy}
        autoFocus
      />
      <div className="msg-reply__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !body.trim()}
          aria-busy={busy}
          onClick={onSend}
        >
          {busy ? 'Sending…' : 'Send reply'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setBody('')
            setError(null)
          }}
        >
          Cancel
        </button>
        {error && (
          <span role="alert" className="inline-error">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
