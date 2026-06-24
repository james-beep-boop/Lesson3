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
 * Export is two-phase (SPEC §9; readiness #1): a warm request downloads the .zip; a cold one
 * returns 202 while the generateArtifact job runs. So we drive it through `downloadExport`
 * (fetch → poll → download) instead of a plain navigation, and surface a "Preparing…" state.
 */
import React, { useState } from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

import { downloadExport, type ExportState } from '../exportClient'

type Format = 'standard' | 'compact'
type Kind = 'docx' | 'pdf'

export default function ExportBundle() {
  const { id, hasPublishedDoc } = useDocumentInfo()
  // One control for the Resource column (unchecked by default); maps to the standard/compact format.
  const [resources, setResources] = useState(false)
  const [kind, setKind] = useState<Kind>('docx')
  const [state, setState] = useState<ExportState>('idle')
  const [error, setError] = useState<string | null>(null)

  // No id → unsaved document; nothing to export yet.
  if (!id) return null

  const format: Format = resources ? 'standard' : 'compact'
  const exportable = hasPublishedDoc
  const busy = state === 'preparing' || state === 'downloading'
  const onExport = () => {
    if (!exportable || busy) return
    setError(null)
    downloadExport(`/api/lesson-bundles/${id}/export?format=${format}&as=${kind}`, {
      onState: (s, message) => {
        setState(s)
        if (s === 'error' && message) setError(message)
      },
    }).catch(() => {
      /* state/error already set via onState */
    })
  }

  const buttonLabel =
    state === 'preparing' ? 'Preparing…' : state === 'downloading' ? 'Downloading…' : 'Export .zip'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
        <input
          type="checkbox"
          checked={resources}
          onChange={(e) => setResources(e.target.checked)}
          disabled={!exportable || busy}
        />
        Include ARES Resources
      </label>
      <select
        id="export-kind"
        aria-label="File type"
        value={kind}
        onChange={(e) => setKind(e.target.value as Kind)}
        disabled={!exportable || busy}
        style={{ padding: '0.25rem', borderRadius: '4px' }}
      >
        <option value="docx">DOCX</option>
        <option value="pdf">PDF</option>
      </select>
      <Button
        buttonStyle="secondary"
        size="small"
        onClick={onExport}
        disabled={!exportable || busy}
        tooltip={exportable ? undefined : 'Publish this bundle to enable export'}
      >
        {buttonLabel}
      </Button>
      {error ? (
        <span role="alert" style={{ color: '#b00020', fontSize: '0.8rem' }}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
