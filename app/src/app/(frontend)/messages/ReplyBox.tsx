'use client'

/**
 * Inline reply for an inbox message (SPEC §10). A "Reply" button expands the same kind of compose box
 * the top Composer uses, with the recipient fixed to the original sender (and the original lesson link
 * carried along, so the reply stays about the same lesson). POSTs Payload's default REST — `sender` is
 * stamped server-side, rate-limited — like Composer/FavoriteToggle. On success it refreshes the inbox.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ReplyBox({
  recipientId,
  recipientName,
  planId,
  versionId,
}: {
  recipientId: number
  recipientName: string
  /** The original message's lesson link, re-attached so the reply keeps context (null = none). */
  planId?: number | null
  versionId?: number | null
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
      const res = await fetch('/api/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: recipientId,
          body: body.trim(),
          ...(planId != null ? { lessonPlan: planId } : {}),
          // Only carry the version when its plan is too — the server rejects a version without its plan.
          ...(planId != null && versionId != null ? { version: versionId } : {}),
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null
        throw new Error(payload?.errors?.[0]?.message ?? 'Could not send the reply.')
      }
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
      <button type="button" className="msg-reply-toggle" onClick={() => setOpen(true)}>
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
          className="msg-compose__send"
          disabled={busy || !body.trim()}
          onClick={onSend}
        >
          {busy ? 'Sending…' : 'Send reply'}
        </button>
        <button
          type="button"
          className="msg-reply__cancel"
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
          <span role="alert" className="msg-compose__error">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
