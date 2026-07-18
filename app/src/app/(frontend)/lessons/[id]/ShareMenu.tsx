'use client'

/**
 * Share ▾ — the lesson page's ONE home for share/export actions (declutter L2, 2026-07-15;
 * per-document downloads folded in 2026-07-17 when the page's Documents line was removed):
 * Download all as Word/PDF .zips (SPEC §9 two-phase export → `downloadExport`), a per-document
 * PDF/Word list (the full DocStrip — same known-good buttons as the catalogue rows), Email…
 * (SPEC §10 — the compose form is the composed `EmailModal`), and Message a colleague (§10
 * handoff link). Folding these behind one disclosure is what un-clutters the action bar; every
 * item keeps its exact prior behaviour.
 *
 * This stays a thin coordinator: it owns the disclosure + the download-all flow, and delegates the
 * email compose form to `EmailModal` and the per-document buttons to `DocStrip`/`DocButtons`
 * (which own their own busy/error state; the menu deliberately stays OPEN for those so their
 * inline "Preparing…" state is visible where the click happened).
 *
 * APG disclosure pattern (the app standard since D6): an aria-expanded button + a toggled panel in
 * plain tab order — not menu ARIA. Outside-click and Escape close it. Download progress and the
 * queued-email note surface as a small status line next to the button, since the menu closes on
 * selection.
 */
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { downloadExport, type ExportState } from '@/components/exportClient'
import DocStrip from '@/components/DocStrip'
import type { DeliverableTag } from '@/generator/exportArtifacts'
import EmailModal from './EmailModal'

export default function ShareMenu({
  planId,
  versionId,
  semver,
  deliverables = [],
}: {
  planId: number
  versionId: number
  /** Shown in the menu's footnote so "Download all" is unambiguous while browsing old versions. */
  semver?: string | null
  /** This version's documents — drives the per-document download list (empty → section omitted). */
  deliverables?: DeliverableTag[]
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  // Download-all state (was DownloadButtons): one export at a time is plenty for a menu flow.
  const [exportState, setExportState] = useState<ExportState>('idle')
  const exporting = exportState === 'preparing' || exportState === 'downloading'

  const [emailOpen, setEmailOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Outside click / Escape close the panel (same behaviour as the user menu's disclosure).
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onDownloadAll = (as: 'docx' | 'pdf') => {
    if (exporting) return
    setOpen(false)
    setNote(null)
    setError(null)
    downloadExport(`/api/lesson-bundle-versions/${versionId}/export?as=${as}`, {
      onState: (s, message) => {
        setExportState(s)
        if (s === 'error' && message) setError(message)
      },
    }).catch(() => {
      /* state/error already surfaced via onState */
    })
  }

  const busyText =
    exportState === 'preparing' ? 'Preparing…' : exportState === 'downloading' ? 'Downloading…' : null

  return (
    <span className="share-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => {
          setNote(null)
          setError(null)
          setOpen((v) => !v)
        }}
      >
        Share ▾
      </button>
      {open && (
        <div className="share-menu">
          <button type="button" disabled={exporting} onClick={() => onDownloadAll('docx')}>
            Download all — Word (.zip)
          </button>
          <button type="button" disabled={exporting} onClick={() => onDownloadAll('pdf')}>
            Download all — PDF (.zip)
          </button>
          {/* Per-document downloads (2026-07-17, replacing the page's Documents line): the full
              DocStrip — one row per document, PDF opens a tab / Word downloads. These keep the
              menu OPEN (no onClick close): their busy state renders inline on the row. */}
          {deliverables.length > 0 && (
            <div className="share-menu__docs">
              <p className="share-menu__group-label">Download one document</p>
              <DocStrip versionId={versionId} tags={deliverables} />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setEmailOpen(true)
            }}
          >
            Email to an address…
          </button>
          {/* Internal messaging handoff (§10): prefills compose with this plan+version as the link. */}
          <Link href={`/messages?plan=${planId}&version=${versionId}`}>Message a colleague</Link>
          <p className="share-menu__note">
            Everything here acts on this version{semver ? ` (${semver})` : ''}.
          </p>
        </div>
      )}
      {busyText && (
        <span role="status" className="muted" aria-busy="true">
          {busyText}
        </span>
      )}
      {note && (
        <span role="status" className="muted">
          {note}
        </span>
      )}
      {error && (
        <span role="alert" className="inline-error">
          {error}
        </span>
      )}

      {emailOpen && (
        <EmailModal
          versionId={versionId}
          onClose={() => setEmailOpen(false)}
          onSent={(addr) => {
            setNote(`Sending to ${addr}…`)
            setEmailOpen(false)
          }}
        />
      )}
    </span>
  )
}
