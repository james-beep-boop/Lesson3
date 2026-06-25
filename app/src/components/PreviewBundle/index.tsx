'use client'

/**
 * PreviewBundle — admin edit-view control to open the content preview (SPEC §5) of the
 * lesson-plan version being edited, in a new tab. Injected via
 * `admin.components.edit.beforeDocumentControls` on the lesson-bundle-versions collection.
 *
 * It previews the editor's CURRENT form state — UNSAVED edits included — so you don't have to
 * save before checking output. The current field values are read from the form
 * (`useAllFormFields` + `reduceFieldsToValues`) and POSTed to
 * `/api/lesson-bundle-versions/:id/preview?format=…` (see endpoints/previewVersion.ts), which is
 * READ-access-gated and draft-capable; it overlays the posted content onto the stored,
 * access-checked bundle and returns a script-free HTML page. We submit a hidden, transient
 * `<form method="POST" target="_blank">` so the browser opens the endpoint's real HTML
 * response in a new tab (with its real CSP headers) — no fetch/blob round-trip.
 *
 * Same-origin POST → the admin auth cookie rides along and the endpoint sees `req.user`.
 */
import React, { useState } from 'react'
import { Button, useAllFormFields, useDocumentInfo } from '@payloadcms/ui'
import { reduceFieldsToValues } from 'payload/shared'

import { ResourcesCheckbox } from '../ResourcesCheckbox'
import { formatFromResources } from '../../lib/format'

export default function PreviewBundle() {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  // One control for the Resource column, unchecked by default (the column is deferred/blank, so
  // the default preview omits it). Maps to the standard/compact format.
  const [resources, setResources] = useState(false)

  // No id → unsaved/new document; nothing stored to authorize the preview against yet.
  if (!id) return null

  const format = formatFromResources(resources)

  const onPreview = () => {
    // Unflatten the live form state to the bundle's nested shape (meta/unit/lessons/…).
    const data = reduceFieldsToValues(fields, true)

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `/api/lesson-bundle-versions/${id}/preview?format=${format}`
    form.target = '_blank'
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'data'
    input.value = JSON.stringify(data)
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
    form.remove()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
      <ResourcesCheckbox checked={resources} onChange={setResources} />
      <Button
        buttonStyle="secondary"
        size="small"
        onClick={onPreview}
        tooltip="Preview current edits (unsaved included)"
      >
        Preview
      </Button>
    </div>
  )
}
