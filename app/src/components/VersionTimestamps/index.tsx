'use client'

import React from 'react'
import { useFormFields } from '@payloadcms/ui'

/**
 * Sidebar display of the version's Last Modified / Created timestamps (UI field, no DB column).
 * Relocates what Payload natively shows in the document-controls row; that native row is hidden for
 * this collection in `(payload)/custom.scss`. Reads the values straight from the form state.
 */
const fmt = (v: unknown): string => {
  if (typeof v !== 'string' && typeof v !== 'number') return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
}

export default function VersionTimestamps() {
  const { updatedAt, createdAt } = useFormFields(([fields]) => ({
    updatedAt: fields?.updatedAt?.value,
    createdAt: fields?.createdAt?.value,
  }))
  return (
    <div className="version-timestamps">
      <div className="version-timestamps__row">
        <span className="version-timestamps__label">Last Modified</span>
        <span className="version-timestamps__value">{fmt(updatedAt)}</span>
      </div>
      <div className="version-timestamps__row">
        <span className="version-timestamps__label">Created</span>
        <span className="version-timestamps__value">{fmt(createdAt)}</span>
      </div>
    </div>
  )
}
