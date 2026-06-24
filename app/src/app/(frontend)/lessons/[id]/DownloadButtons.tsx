'use client'

/**
 * Teacher download controls (SPEC §9). Export is two-phase — a warm request downloads the .zip,
 * a cold one returns 202 while the generateArtifact job runs — so these are JS-driven buttons
 * (fetch → poll → download via `downloadExport`), not plain `<a href>` links that can't follow
 * the 202 handshake. Each button shows its own Preparing…/Downloading… state and any error.
 */
import React, { useState } from 'react'

import { downloadExport, type ExportState } from '@/components/exportClient'

// Only the genuine choice — DOCX vs PDF. Whether the Resource column is included follows the
// page's "Include ARES Resources" checkbox (the `format` prop), not a per-button choice.
const OPTIONS = [
  { as: 'docx', label: 'DOCX' },
  { as: 'pdf', label: 'PDF' },
] as const

export default function DownloadButtons({
  id,
  format,
}: {
  id: string
  format: 'standard' | 'compact'
}) {
  const [states, setStates] = useState<Record<string, ExportState>>({})
  const [error, setError] = useState<string | null>(null)

  const start = (key: string, url: string) => {
    if (states[key] === 'preparing' || states[key] === 'downloading') return
    setError(null)
    downloadExport(url, {
      onState: (s, message) => {
        setStates((prev) => ({ ...prev, [key]: s }))
        if (s === 'error' && message) setError(message)
      },
    }).catch(() => {
      /* state/error already surfaced via onState */
    })
  }

  return (
    <>
      {OPTIONS.map(({ as, label }) => {
        const key = as
        const s = states[key]
        const busy = s === 'preparing' || s === 'downloading'
        const text = s === 'preparing' ? 'Preparing…' : s === 'downloading' ? 'Downloading…' : label
        return (
          <button
            key={key}
            type="button"
            className="btn"
            disabled={busy}
            aria-busy={busy}
            onClick={() => start(key, `/api/lesson-bundles/${id}/export?format=${format}&as=${as}`)}
          >
            {text} (.zip)
          </button>
        )
      })}
      {error ? (
        <span role="alert" className="muted" style={{ color: '#b00020' }}>
          {error}
        </span>
      ) : null}
    </>
  )
}
