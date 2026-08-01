'use client'

/**
 * Manage — the saved/candidate versions list. Each row is a draft the CALLER may delete (the server
 * component builds rows with the caller's access, mirroring `lessonBundleVersionDelete`): the label
 * opens the version in the editor with edit intent (`?edit=1` — click resumes editing, decided
 * 2026-07-01), ✕ deletes it after a confirm (`DELETE /api/lesson-bundle-versions/:id` — the server
 * access + Official guard remain the authority) and refreshes the server view.
 */
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'

export interface CandidateRow {
  id: number
  label: string
  semver: string
  sgLabel: string
  authorName: string | null
  savedAt: string
}

export function CandidateList({
  rows,
  emptyText,
  showAuthor,
}: {
  rows: CandidateRow[]
  emptyText: string
  showAuthor: boolean
}) {
  const router = useRouter()
  const { config } = useConfig()
  const [busyId, setBusyId] = useState<number | null>(null)

  if (rows.length === 0) return <p className="lp-manage__empty">{emptyText}</p>

  const apiBase = apiBaseFrom(config)

  const onDelete = async (row: CandidateRow) => {
    if (busyId != null) return
    if (!window.confirm(`Delete “${row.label}” v${row.semver}? This cannot be undone.`)) return
    setBusyId(row.id)
    try {
      const res = await fetch(`${apiBase}/lesson-bundle-versions/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { errors?: { message: string }[] } | null
        throw new Error(json?.errors?.[0]?.message || `Delete failed (${res.status})`)
      }
      toast.success(`Deleted “${row.label}” v${row.semver}.`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ul className="lp-manage__list">
      {rows.map((row) => {
        const href = `/admin/collections/lesson-bundle-versions/${row.id}?edit=1`
        // One metadata LINE, not a row of floating chips. The version is ordinary metadata here:
        // it used to render as `.lp-admin-list__badge`, which gave a piece of status the shape of a
        // control — exactly what the button system's "status is not a variant" rule forbids.
        const meta = [
          row.sgLabel,
          `Version ${row.semver}`,
          showAuthor ? (row.authorName ?? 'Unknown author') : null,
          row.savedAt ? `Saved ${row.savedAt}` : null,
        ].filter(Boolean)
        return (
          <li key={row.id} className="lp-manage__row">
            <div className="lp-manage__row-main">
              <Link className="lp-manage__link" href={href}>
                {row.label}
              </Link>
              <p className="lp-manage__meta">{meta.join(' · ')}</p>
            </div>
            {/* The title is still the obvious link, but the action is also NAMED: "click the row to
                resume editing" was never stated anywhere on the page. */}
            <div className="lp-manage__row-actions">
              <Link className="btn" href={href}>
                Continue editing
              </Link>
              <Button
                buttonStyle="error"
                size="small"
                disabled={busyId != null}
                onClick={() => void onDelete(row)}
              >
                {busyId === row.id ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
