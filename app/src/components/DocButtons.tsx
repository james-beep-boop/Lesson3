'use client'

/**
 * Per-document PDF / Word buttons for one deliverable (teacher-first T2, DECISIONS 2026-07-08).
 * PDF opens in a NEW TAB (the endpoint serves it `Content-Disposition: inline`); Word saves to disk
 * (`attachment`). Both first ensure the (version, kind) artifact cache is warm — a no-op for
 * pre-warmed Officials, a short "Preparing…" for anything cold — and both then hand delivery to
 * `exportClient`, so neither navigates the page the reader is on.
 *
 * ⚑ WORD NO LONGER NAVIGATES. It used to point a bare anchor at the `attachment` URL and rely on the
 * browser aborting the resulting navigation; iOS Safari does not, which dropped a phone reader out
 * of the app when they pressed Back. See `downloadPreparedDocument`.
 *
 * Popup-blocker note: the PDF tab is opened SYNCHRONOUSLY in the click handler (allowed), shows a
 * small "Preparing…" note while the cache warms, then navigates to the document. On failure the
 * tab is closed and the error surfaces inline instead.
 */
import React, { useState } from 'react'

import { downloadPreparedDocument, openPreparedPdfInNewTab } from './exportClient'
import type { DeliverableTag } from '@/generator/exportArtifacts'

type Kind = 'docx' | 'pdf'

export default function DocButtons({ versionId, tag }: { versionId: number; tag: DeliverableTag }) {
  const [busy, setBusy] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exportUrl = (kind: Kind) => `/api/lesson-bundle-versions/${versionId}/export?as=${kind}`
  const docUrl = (kind: Kind) =>
    `/api/lesson-bundle-versions/${versionId}/export/doc?doc=${tag}&as=${kind}`

  const openPdf = async () => {
    if (busy) return
    setBusy('pdf')
    setError(null)
    try {
      await openPreparedPdfInNewTab(exportUrl('pdf'), docUrl('pdf'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the PDF.')
    } finally {
      setBusy(null)
    }
  }

  const downloadWord = async () => {
    if (busy) return
    setBusy('docx')
    setError(null)
    try {
      await downloadPreparedDocument(exportUrl('docx'), docUrl('docx'))
      setBusy(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download the document.')
      setBusy(null)
    }
  }

  return (
    <span className="doc-buttons">
      <button
        type="button"
        className="btn btn--quiet btn--compact"
        disabled={busy !== null}
        aria-busy={busy === 'pdf'}
        onClick={openPdf}
      >
        {busy === 'pdf' ? 'Preparing…' : 'PDF'}
      </button>
      {/* ⚑ `doc-buttons__word` EXISTS ONLY SO PHONES CAN DROP THIS ONE BUTTON — see the rule in
          `styles.css`. Both pills are otherwise identically classed, so there was nothing to target. */}
      <button
        type="button"
        className="btn btn--quiet btn--compact doc-buttons__word"
        disabled={busy !== null}
        aria-busy={busy === 'docx'}
        onClick={downloadWord}
      >
        {busy === 'docx' ? 'Preparing…' : 'Word'}
      </button>
      {error && (
        <span role="alert" className="inline-error">
          {error}
        </span>
      )}
    </span>
  )
}
