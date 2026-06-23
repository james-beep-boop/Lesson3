'use client'

/**
 * ExportBundle — admin edit-view control to download a bundle's three DOCX as a .zip,
 * with a per-export LessonSequence format toggle (SPEC §9). Injected via
 * `admin.components.edit.beforeDocumentControls` on the lesson-bundles collection.
 *
 * It hits `GET /api/lesson-bundles/:id/export?format=…` (see endpoints/exportBundle.ts),
 * which is READ-access-gated and published-only. So:
 *   - hidden entirely on an unsaved/new doc (no id yet);
 *   - disabled with a hint when no published version exists (export is published-only;
 *     `hasPublishedDoc` is false). The format is a per-export choice, never stored.
 *
 * The download is a same-origin GET, so the admin auth cookie rides along and the
 * endpoint sees `req.user`. We navigate via window.location: the attachment
 * Content-Disposition makes the browser download without unloading this page.
 */
import React, { useState } from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

type Format = 'standard' | 'compact'
type Kind = 'docx' | 'pdf'

export default function ExportBundle() {
  const { id, hasPublishedDoc } = useDocumentInfo()
  const [format, setFormat] = useState<Format>('standard')
  const [kind, setKind] = useState<Kind>('docx')

  // No id → unsaved document; nothing to export yet.
  if (!id) return null

  const exportable = hasPublishedDoc
  const onExport = () => {
    if (!exportable) return
    window.location.assign(`/api/lesson-bundles/${id}/export?format=${format}&as=${kind}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
      <label htmlFor="export-format" style={{ fontSize: '0.8rem' }}>
        Format
      </label>
      <select
        id="export-format"
        value={format}
        onChange={(e) => setFormat(e.target.value as Format)}
        disabled={!exportable}
        style={{ padding: '0.25rem', borderRadius: '4px' }}
      >
        <option value="standard">Standard</option>
        <option value="compact">Compact (no Resource column)</option>
      </select>
      <select
        id="export-kind"
        aria-label="File type"
        value={kind}
        onChange={(e) => setKind(e.target.value as Kind)}
        disabled={!exportable}
        style={{ padding: '0.25rem', borderRadius: '4px' }}
      >
        <option value="docx">DOCX</option>
        <option value="pdf">PDF</option>
      </select>
      <Button
        buttonStyle="secondary"
        size="small"
        onClick={onExport}
        disabled={!exportable}
        tooltip={exportable ? undefined : 'Publish this bundle to enable export'}
      >
        Export .zip
      </Button>
    </div>
  )
}
