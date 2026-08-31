'use client'

/**
 * Share ▾ — the lesson page's home for WHOLE-VERSION share/export actions, and for the supporting
 * documents (declutter L2, 2026-07-15; per-document downloads folded in 2026-07-17 when the page's
 * Documents line was removed; the primary Lesson plan moved OUT to the action bar 2026-08-30, so
 * this is no longer the page's only home for downloads and the docblock no longer claims to be):
 * Download all as Word/PDF .zips (SPEC §9 two-phase export → `downloadExport`), a per-document
 * PDF/Word list for the SUPPORTING documents (a DocStrip — same known-good buttons as the
 * catalogue rows; the Lesson plan's own pair lives on the action bar outside this menu), Email…
 * (SPEC §10 — the compose form is the composed `EmailModal`), and Message a colleague (§10
 * handoff link). Folding these behind one disclosure is what un-clutters the action bar. Every item
 * keeps its exact prior behaviour; what changed on 2026-08-30 is WHICH items are here, not how any
 * of them works.
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
import { secondaryDeliverables } from '@/generator/deliverables'
import type { DeliverableTag } from '@/generator/exportArtifacts'
import EmailModal, { type EmailFormat } from './EmailModal'

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
  // ⚑ THE PRIMARY LESSON PLAN IS FILTERED OUT HERE (2026-08-30), and this is the SAME split the
  // catalogue row has always used (`DocStrip … condensed`): the lesson page's action bar now renders
  // the Lesson plan's own PDF/Word, so listing it again three centimetres below would put the
  // identical pair of buttons on screen twice. `deliverables.ts`'s header names this exact hazard —
  // the primary/secondary split exists so that surfacing the primary on one surface cannot
  // "double-render or drop a document" on the other. Surfacing it without filtering here was the
  // one-sided half of that move.
  const supporting = secondaryDeliverables(deliverables)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  // Download-all state (was DownloadButtons): one export at a time is plenty for a menu flow.
  const [exportState, setExportState] = useState<ExportState>('idle')
  const exporting = exportState === 'preparing' || exportState === 'downloading'

  // Which format the open compose form will send; `null` means the form is closed.
  const [emailFormat, setEmailFormat] = useState<EmailFormat | null>(null)
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

  const openEmail = (format: EmailFormat) => {
    setOpen(false)
    setNote(null)
    setError(null)
    setEmailFormat(format)
  }

  const busyText =
    exportState === 'preparing'
      ? 'Preparing…'
      : exportState === 'downloading'
        ? 'Downloading…'
        : null

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
          {/* Hidden at phone width with the per-document Word buttons — see `styles.css`. A .zip of
              .docx files is the least useful thing a phone can be handed. */}
          <button
            type="button"
            className="share-menu__word-zip"
            disabled={exporting}
            onClick={() => onDownloadAll('docx')}
          >
            Download all — Word (.zip)
          </button>
          <button type="button" disabled={exporting} onClick={() => onDownloadAll('pdf')}>
            Download all — PDF (.zip)
          </button>
          {/* Per-document downloads (2026-07-17, replacing the page's Documents line; narrowed to
              the SUPPORTING documents 2026-08-30 — see `supporting` above): one row per document,
              PDF opens a tab / Word downloads. These keep the menu OPEN (no onClick close): their
              busy state renders inline on the row. */}
          {supporting.length > 0 && (
            <div className="share-menu__docs">
              <p className="share-menu__group-label">Download one document</p>
              <DocStrip versionId={versionId} tags={supporting} />
            </div>
          )}
          {/* ⚑ EMAIL MIRRORS DOWNLOAD, one entry per format. It was a single "Email to an address…"
              that always sent Word, while Download offered both — an asymmetry against SPEC §10's own
              model, where an artifact is (version, document, KIND) and "only the deliverable `kind`
              varies". The endpoint already took `?as=docx|pdf`; only the UI withheld it.
              ⚑ THE ELLIPSIS STAYS, and it is the one thing that distinguishes these from the two
              entries above: Download acts on click, Email opens a form for the address. Without it,
              four adjacent items would look like four of the same kind of action, and two of them
              are not. It also says WHAT is sent, which "Email to an address…" never did. */}
          <button type="button" onClick={() => openEmail('docx')}>
            Email all — Word (.zip)…
          </button>
          <button type="button" onClick={() => openEmail('pdf')}>
            Email all — PDF (.zip)…
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

      {emailFormat && (
        <EmailModal
          versionId={versionId}
          format={emailFormat}
          onClose={() => setEmailFormat(null)}
          onSent={(addr) => {
            setNote(`Sending ${emailFormat === 'pdf' ? 'PDF' : 'Word'} to ${addr}…`)
            setEmailFormat(null)
          }}
        />
      )}
    </span>
  )
}
