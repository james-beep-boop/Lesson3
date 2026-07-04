'use client'

/**
 * Compose form for /messages — POSTs Payload's default REST (POST /api/messages; `sender` is
 * stamped server-side, creation is rate-limited). State-changing → JS-driven POST (CSRF-guarded
 * by the SameSite=Lax cookie), like FavoriteToggle. `about` (from the lesson page's ?plan=/
 * ?version= handoff) rides along as the optional lesson link; "clear" just drops the params.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import { sendMessage } from './sendMessage'

export default function Composer({
  roster,
  about,
}: {
  roster: { id: number; name: string }[]
  about: { planId: number; versionId: number | null; title: string } | null
}) {
  const router = useRouter()
  const [recipient, setRecipient] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'sent' | 'error'; text: string } | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipient || !body.trim() || busy) return
    setBusy(true)
    setNote(null)
    try {
      await sendMessage({
        recipient: Number(recipient),
        body: body.trim(),
        lessonPlan: about?.planId,
        version: about?.versionId,
      })
      setBody('')
      setNote({ kind: 'sent', text: 'Message sent.' })
      router.refresh()
    } catch (err) {
      setNote({ kind: 'error', text: err instanceof Error ? err.message : 'Could not send the message.' })
    }
    setBusy(false)
  }

  return (
    <form className="msg-compose" onSubmit={onSubmit}>
      <h2>Send a message</h2>
      {about && (
        <p className="msg-compose__about">
          About: <strong>{about.title}</strong>{' '}
          <a href="/messages" className="msg-compose__clear">
            (clear)
          </a>
        </p>
      )}
      <label className="msg-compose__field">
        To
        <select
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          required
          disabled={busy}
        >
          <option value="" disabled>
            Choose a recipient…
          </option>
          {roster.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="msg-compose__field">
        Message
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={5000}
          required
          disabled={busy}
          placeholder="Write a note…"
        />
      </label>
      <div className="msg-compose__actions">
        <button type="submit" className="msg-compose__send" disabled={busy || !recipient || !body.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
        {note && (
          <span className={note.kind === 'error' ? 'msg-compose__error' : 'msg-compose__sent'} role="status">
            {note.text}
          </span>
        )}
      </div>
    </form>
  )
}
