'use client'

/**
 * Email-a-doc compose modal (SPEC §10). Collects a recipient and POSTs to
 * `/api/lesson-bundle-versions/:id/email` — the server generates (or reuses) the export zip and
 * mails it from a Jobs Queue task; a 202 means QUEUED (delivery is asynchronous).
 * State-changing → JS-driven POST (CSRF-guarded by the SameSite=Lax cookie).
 *
 * ⚑ THE FORMAT IS THE CALLER'S, not hardcoded. This modal sent `?as=docx` unconditionally while the
 * endpoint had accepted `?as=docx|pdf` from the start — so Share offered both formats for Download
 * and silently only Word for Email. SPEC §10 defines an artifact as (version, document, KIND) and
 * says "Only the deliverable `kind` varies", so the asymmetry was a UI gap against the app's own
 * model rather than a restriction anyone chose. The body copy names the format for the same reason:
 * "a .zip of Word files" was hardcoded and would be a lie for half the entries.
 *
 * A self-contained unit composed by `ShareMenu` (declutter 2026-07-15): it owns its own recipient
 * / sending / error state, so the menu stays a thin coordinator and download errors never bleed
 * into the compose form. On a successful queue it calls `onSent(addr)` and the caller surfaces the
 * "Sending to…" status; the trigger lives in the caller.
 */
import React, { useState } from 'react'

import Modal from '@/components/Modal'

/** The deliverable kind, per SPEC §10's `(version, document, kind)`. */
export type EmailFormat = 'docx' | 'pdf'

const FORMAT_LABEL: Record<EmailFormat, string> = { docx: 'Word', pdf: 'PDF' }

export default function EmailModal({
  versionId,
  format,
  onClose,
  onSent,
}: {
  versionId: number
  /** Which kind to send. Chosen in `ShareMenu`, so the menu entry and the mail cannot disagree. */
  format: EmailFormat
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
      const res = await fetch(`/api/lesson-bundle-versions/${versionId}/email?as=${format}`, {
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
    <Modal title={`Email this lesson plan — ${FORMAT_LABEL[format]}`} onClose={close}>
      <form onSubmit={onSubmit} className="modal__form">
        <p className="modal__body">
          Send the generated documents (a .zip of {FORMAT_LABEL[format]} files) to any email address
          — your own, or a colleague&apos;s.
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
          <button
            type="submit"
            className="btn btn--primary"
            disabled={sending || !to.trim()}
            aria-busy={sending}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
          <button type="button" className="btn" onClick={close} disabled={sending}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
