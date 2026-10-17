'use client'

/**
 * Manage — "Your unsaved work" (SPEC §5, "Keep for later", 2026-10-17).
 *
 * The caller's own edit-recovery captures, so work kept for later can be found again without
 * remembering which version it was on. Resume opens the editor with edit intent, where the existing
 * restore prompt takes over; Discard calls the existing discard endpoint with the precondition the
 * server rendered, so a capture that moved since the page loaded (another tab still typing) is
 * refused rather than destroyed.
 *
 * ⚑ NOT an accordion panel, deliberately. Every non-administrator's Manage page is one box with one
 * child that `initialOpen`'s lone-child rule opens for them; a second child would close both and put
 * their saved versions behind a click. Unsaved work is also the one thing on this page that expires,
 * so it is shown above the accordion — and only when there is some, so nobody's page grows.
 *
 * ⚑ Vocabulary: this is "unsaved work", never "drafts". A draft in this product is a saved version
 * (SPEC §5, §13).
 */
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
import { CAPTURE_TTL_DAYS } from '../../lib/editRecovery/ttl'
import type { UnsavedWorkRow } from '../../lib/editRecovery/unsavedWork'
import { wireErrorMessage } from '../../lib/wireError'

/** A server row with its dates pre-formatted (so hydration cannot disagree) and its label resolved. */
export type UnsavedWorkItem = Omit<UnsavedWorkRow, 'capturedAt' | 'subjectGradeId'> & {
  sgLabel: string
  capturedOn: string
  keptUntil: string
}

export function UnsavedWorkList({ rows }: { rows: UnsavedWorkItem[] }) {
  const router = useRouter()
  const { config } = useConfig()
  const [busyId, setBusyId] = useState<number | null>(null)

  if (rows.length === 0) return null
  const apiBase = apiBaseFrom(config)

  const onDiscard = async (row: UnsavedWorkItem) => {
    if (busyId != null) return
    if (
      !window.confirm(
        `Discard your unsaved changes to “${row.label}” v${row.semver}? This cannot be undone.`,
      )
    ) {
      return
    }
    setBusyId(row.versionId)
    try {
      const res = await fetch(`${apiBase}/lesson-bundle-versions/${row.versionId}/recovery`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          generation: row.token.generation,
          expectedRevision: row.token.revision,
        }),
      })
      if (!res.ok) throw new Error(await wireErrorMessage(res, 'Discard failed'))
      toast.success(`Discarded your unsaved changes to “${row.label}”.`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Discard failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="lp-manage__unsaved" aria-labelledby="lp-unsaved-heading">
      <h2 id="lp-unsaved-heading" className="lp-manage__unsaved-title">
        Your unsaved work
      </h2>
      <p className="lp-manage__desc">
        Changes you have not saved as a version yet. Only you can see them. Each is kept for{' '}
        {CAPTURE_TTL_DAYS} days after you last worked on it.
      </p>
      <ul className="lp-manage__list">
        {rows.map((row) => {
          const href = `/admin/collections/lesson-bundle-versions/${row.versionId}?edit=1`
          const meta = [
            row.sgLabel,
            `Version ${row.semver}`,
            `Backed up ${row.capturedOn}`,
            `Kept until ${row.keptUntil}`,
          ].filter(Boolean)
          return (
            <li key={row.versionId} className="lp-manage__row">
              <div className="lp-manage__row-main">
                <Link className="lp-manage__link" href={href}>
                  {row.label}
                </Link>
                <p className="lp-manage__meta">{meta.join(' · ')}</p>
                {!row.restorable && (
                  <p className="lp-manage__meta">
                    This version has changed since you worked on it, so your changes cannot be put
                    back automatically. Open it to copy what you still need.
                  </p>
                )}
              </div>
              <div className="lp-manage__row-actions">
                <Link className="btn lp-btn" href={href}>
                  {row.restorable ? 'Resume' : 'Open to copy'}
                </Link>
                <Button
                  className="lp-btn"
                  buttonStyle="error"
                  size="small"
                  disabled={busyId != null}
                  onClick={() => void onDiscard(row)}
                >
                  {busyId === row.versionId ? 'Discarding…' : 'Discard'}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
