'use client'

/**
 * Email-a-doc control (SPEC §10). Opens a small modal to collect a recipient, then POSTs to
 * `/api/lesson-bundle-versions/:id/email` — the server generates (or reuses) the export zip and
 * mails it from a Jobs Queue task. Sends the DOCX zip (the faithful primary deliverable). A 202
 * means QUEUED — delivery is asynchronous. State-changing → JS-driven POST (CSRF-guarded by the
 * SameSite=Lax cookie).
 */
import React, { useState } from 'react'

import Modal from '@/components/Modal'

export default function EmailDocButton({ versionId }: { versionId: number }) {
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setOpen(false)
    setError(null)
  }

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const addr = to.trim()
    if (!addr || busy) return
    setBusy(true)
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
      setNote(`Sending to ${addr}…`)
      setOpen(false)
      setTo('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the email.')
    }
    setBusy(false)
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setNote(null)
          setError(null)
          setOpen(true)
        }}
      >
        Email…
      </button>
      {/* role="status" so the queued confirmation is announced to assistive tech (matches the
          Composer's sent-note); the error above already uses role="alert". */}
      {note && (
        <span role="status" className="muted">
          {note}
        </span>
      )}

      {open && (
        <Modal title="Email this lesson plan" onClose={close}>
          <form onSubmit={onSend} className="modal__form">
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
                disabled={busy}
                autoComplete="email"
              />
            </label>
            {error && (
              <span role="alert" className="inline-error">
                {error}
              </span>
            )}
            <div className="modal__actions">
              <button type="submit" className="btn" disabled={busy || !to.trim()} aria-busy={busy}>
                {busy ? 'Sending…' : 'Send'}
              </button>
              <button type="button" className="modal__cancel" onClick={close} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
