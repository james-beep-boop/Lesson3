'use client'

/**
 * Per-document PDF / Word buttons for one deliverable (teacher-first T2, DECISIONS 2026-07-08).
 * PDF opens in a NEW TAB (the endpoint serves it `Content-Disposition: inline`); Word downloads
 * in place (`attachment`). Both first ensure the (version, kind) artifact cache is warm via
 * `ensureExportReady` — a no-op for pre-warmed Officials, a short "Preparing…" for anything cold.
 *
 * Popup-blocker note: the PDF tab is opened SYNCHRONOUSLY in the click handler (allowed), shows a
 * small "Preparing…" note while the cache warms, then navigates to the document. On failure the
 * tab is closed and the error surfaces inline instead.
 */
import React, { useState } from 'react'

import { ensureExportReady, openPreparedPdfInNewTab } from './exportClient'
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
      await ensureExportReady(exportUrl('docx'))
      // `attachment` disposition — navigating the current page to it triggers a download in place.
      const a = document.createElement('a')
      a.href = docUrl('docx')
      document.body.appendChild(a)
      a.click()
      a.remove()
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
        className="btn btn-doc"
        disabled={busy !== null}
        aria-busy={busy === 'pdf'}
        onClick={openPdf}
      >
        {busy === 'pdf' ? 'Preparing…' : 'PDF'}
      </button>
      <button
        type="button"
        className="btn btn-doc"
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
