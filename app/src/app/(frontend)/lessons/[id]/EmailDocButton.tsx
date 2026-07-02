'use client'

/**
 * Email-a-doc control (SPEC §10). Prompts for a recipient and POSTs to
 * `/api/lesson-bundle-versions/:id/email` — the server generates (or reuses) the export zip and
 * mails it from a Jobs Queue task. Sends the DOCX zip (the faithful primary deliverable); the
 * Resource-column layout follows the page's "Include ARES Resources" checkbox via `format`, same
 * as the download buttons. A 202 means QUEUED — delivery is asynchronous.
 *
 * window.prompt matches the house style for one-value asks (cf. EditActions' window.confirm);
 * state-changing → JS-driven POST (CSRF-guarded by the SameSite=Lax cookie).
 */
import React, { useState } from 'react'

export default function EmailDocButton({
  versionId,
  format,
}: {
  versionId: number
  format: 'standard' | 'compact'
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onEmail = async () => {
    const to = window.prompt('Email this lesson plan (the generated documents, zipped) to:')
    if (!to) return
    setBusy(true)
    setNote(null)
    setError(null)
    try {
      const res = await fetch(`/api/lesson-bundle-versions/${versionId}/email?format=${format}&as=docx`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] }
        throw new Error(body.errors?.[0]?.message ?? 'Could not send the email.')
      }
      setNote(`Sending to ${to.trim()}…`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the email.')
    }
    setBusy(false)
  }

  return (
    <>
      <button type="button" className="btn" disabled={busy} aria-busy={busy} onClick={onEmail}>
        {busy ? 'Sending…' : 'Email…'}
      </button>
      {note && <span className="muted">{note}</span>}
      {error && (
        <span role="alert" className="muted" style={{ color: '#b00020' }}>
          {error}
        </span>
      )}
    </>
  )
}
