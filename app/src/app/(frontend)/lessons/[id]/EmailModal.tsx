'use client'

/**
 * Email-a-doc compose modal (SPEC §10). Collects a recipient and POSTs to
 * `/api/lesson-bundle-versions/:id/email` — the server generates (or reuses) the export zip and
 * mails the DOCX zip from a Jobs Queue task; a 202 means QUEUED (delivery is asynchronous).
 * State-changing → JS-driven POST (CSRF-guarded by the SameSite=Lax cookie).
 *
 * A self-contained unit composed by `ShareMenu` (declutter 2026-07-15): it owns its own recipient
 * / sending / error state, so the menu stays a thin coordinator and download errors never bleed
 * into the compose form. On a successful queue it calls `onSent(addr)` and the caller surfaces the
 * "Sending to…" status; the trigger lives in the caller.
 */
import React, { useState } from 'react'

import Modal from '@/components/Modal'

export default function EmailModal({
  versionId,
  onClose,
  onSent,
}: {
  versionId: number
  /** Called on Escape / backdrop / Cancel — vetoed while a send is in flight. */
  onClose: () => void
  /** Called with the recipient once the send is queued (the caller shows the status note). */
  onSent: (addr: string) => void
}) {
  const [to, setTo] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (sending) return
    onClose()
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const addr = to.trim()
    if (!addr || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/lesson-bundle-versions/${versionId}/email?as=docx`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: addr }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] }
        throw new Error(body.errors?.[0]?.message ?? 'Could not send the email.')
      }
      onSent(addr)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email.')
      setSending(false)
    }
  }

  return (
    <Modal title="Email this lesson plan" onClose={close}>
      <form onSubmit={onSubmit} className="modal__form">
        <p className="modal__body">
          Send the generated documents (a .zip of Word files) to any email address — your own, or a
          colleague&apos;s.
        </p>
        <label className="modal__field">
          Recipient email
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com"
            required
            disabled={sending}
            autoComplete="email"
          />
        </label>
        {error && (
          <span role="alert" className="inline-error">
            {error}
          </span>
        )}
        <div className="modal__actions">
          <button type="submit" className="btn" disabled={sending || !to.trim()} aria-busy={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
          <button type="button" className="modal__cancel" onClick={close} disabled={sending}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
