'use client'

/**
 * Manage — "Your Drafts" (SPEC §5, "Drafts", 2026-10-17).
 *
 * The caller's own drafts (edit-recovery captures), so a draft can be found again without
 * remembering which version it was based on. Continue editing opens the editor with edit intent,
 * where the existing restore prompt takes over; Discard calls the existing discard endpoint with the
 * precondition the
 * server rendered, so a capture that moved since the page loaded (another tab still typing) is
 * refused rather than destroyed.
 *
 * ⚑ NOW THE BODY OF `plans.drafts` (Proposal B, operator decisions 2026-10-22), superseding the
 * 2026-10-17 placement above the accordion. That placement had two reasons: a second child under
 * Lesson plans would close a teacher's saved versions (fixed by `initialOpen`'s first-child rule, which
 * opens "My saved versions"), and drafts expire (answered by the count on the closed heading). The
 * operator decided drafts never open on their own. Present for every role, with an empty state, so
 * the place a draft goes is visible before there is one.
 *
 * ⚑ Vocabulary (operator decision 2026-10-17, SPEC §13): a DRAFT is private, unnumbered work; a
 * VERSION is a numbered save. So rows say "Based on version 1.0.4", never "Version 1.0.4" — the
 * number belongs to the version the draft started from, not to the draft.
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

  const apiBase = apiBaseFrom(config)

  const onDiscard = async (row: UnsavedWorkItem) => {
    if (busyId != null) return
    if (
      !window.confirm(
        `Discard your draft of “${row.label}” (based on version ${row.semver})? This cannot be undone.`,
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
      toast.success(`Discarded your draft of “${row.label}”.`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Discard failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <p className="lp-manage__desc">
        Changes you have not saved as a new version yet. Only you can see them. Each draft is kept
        for {CAPTURE_TTL_DAYS} days after you last worked on it.
      </p>
      {rows.length === 0 && (
        <p className="lp-manage__empty">
          You have no drafts. While editing, choose Save as draft to put work aside without saving a
          new version.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="lp-manage__list">
          {rows.map((row) => {
            const href = `/admin/collections/lesson-bundle-versions/${row.versionId}?edit=1`
            const meta = [
              row.sgLabel,
              `Based on version ${row.semver}`,
              `Saved ${row.capturedOn}`,
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
                      The version this draft is based on has changed, so the draft cannot be put
                      back automatically. Open it to copy what you still need.
                    </p>
                  )}
                </div>
                <div className="lp-manage__row-actions">
                  <Link className="btn lp-btn" href={href}>
                    {row.restorable ? 'Continue editing' : 'Open to copy'}
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
      )}
    </>
  )
}
