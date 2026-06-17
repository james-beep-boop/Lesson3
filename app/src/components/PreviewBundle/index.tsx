'use client'

/**
 * PreviewBundle — admin edit-view control to open the content preview (SPEC §5) of the
 * bundle being edited, in a new tab. Injected via
 * `admin.components.edit.beforeDocumentControls` on the lesson-bundles collection.
 *
 * It opens `GET /api/lesson-bundles/:id/preview?format=…` (see endpoints/previewBundle.ts),
 * which is READ-access-gated and DRAFT-capable — so unlike Export (published-only), Preview
 * is available for any SAVED document, including a draft in progress. It previews the latest
 * SAVED snapshot, so save edits before previewing.
 *
 * Same-origin GET → the admin auth cookie rides along and the endpoint sees `req.user`.
 */
import React, { useState } from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

type Format = 'standard' | 'compact'

export default function PreviewBundle() {
  const { id } = useDocumentInfo()
  // Default to Compact: the Resource column is deferred/blank, so Standard's on-screen
  // preview shows an empty column. The toggle still offers Standard.
  const [format, setFormat] = useState<Format>('compact')

  // No id → unsaved/new document; nothing saved to preview yet.
  if (!id) return null

  const onPreview = () => {
    window.open(`/api/lesson-bundles/${id}/preview?format=${format}`, '_blank', 'noopener')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
      <label htmlFor="preview-format" style={{ fontSize: '0.8rem' }}>
        Format
      </label>
      <select
        id="preview-format"
        value={format}
        onChange={(e) => setFormat(e.target.value as Format)}
        style={{ padding: '0.25rem', borderRadius: '4px' }}
      >
        <option value="standard">Standard</option>
        <option value="compact">Compact (no Resource column)</option>
      </select>
      <Button
        buttonStyle="secondary"
        size="small"
        onClick={onPreview}
        tooltip="Preview the latest saved version (drafts included)"
      >
        Preview
      </Button>
    </div>
  )
}
