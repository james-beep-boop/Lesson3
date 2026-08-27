'use client'

/**
 * Manage — the saved/candidate versions list. Each row is a draft the CALLER may delete (the server
 * component builds rows with the caller's access, mirroring `lessonBundleVersionDelete`): the label
 * opens the version in the editor with edit intent (`?edit=1` — click resumes editing, decided
 * 2026-07-01), Compare to Official opens the existing saved-version comparison in a new tab, and
 * Delete removes it after a confirm (`DELETE /api/lesson-bundle-versions/:id` — the server access +
 * Official guard remain the authority) before refreshing the server view.
 */
import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
import { matchesTokenAnd, tokenise } from '../../lib/substrand'
import CompareToOfficialLink from '../CompareToOfficialLink'

export interface CandidateRow {
  id: number
  lessonPlanId: number
  officialVersionId: number | null
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
  const [query, setQuery] = useState('')

  // Client-side, like the other bounded Manage lists (D11): these rows are already loaded and scoped
  // to what the caller may delete, so filtering them is a string comparison, not a round trip.
  //
  // The rule itself comes from `lib/substrand.ts` — the SAME one `DeletePlansPanel` reaches through
  // `filterRows`, so the two boxes on this page cannot disagree about what a query means. Tokenised
  // ONCE for the whole pass, per that module's own note about per-row re-splitting.
  const shown = useMemo(() => {
    const tokens = tokenise(query)
    if (tokens.length === 0) return rows
    return rows.filter((r) =>
      matchesTokenAnd(
        [r.label, r.sgLabel, `Version ${r.semver}`, r.authorName ?? ''].join(' '),
        tokens,
      ),
    )
  }, [rows, query])

  // The empty STATE (no candidates at all) is instructional copy and predates the search box; it is
  // not the same thing as "your search matched nothing", which is a dead end the reader can back out
  // of. Keeping them distinct means the instructional text never appears as the answer to a query.
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
        const json = (await res.json().catch(() => null)) as {
          errors?: { message: string }[]
        } | null
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
    <>
      <div className="lp-admin-list__bar">
        <input
          className="lp-admin-list__search"
          type="search"
          aria-label="Search saved versions"
          placeholder="Search saved versions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {shown.length === 0 && (
        <p className="lp-manage__empty">No saved versions match “{query.trim()}”.</p>
      )}
      {shown.length > 0 && (
        <ul className="lp-manage__list">
          {shown.map((row) => {
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
                  {row.officialVersionId != null && (
                    <CompareToOfficialLink
                      className="btn lp-btn"
                      planId={row.lessonPlanId}
                      officialVersionId={row.officialVersionId}
                      candidateVersionId={row.id}
                    />
                  )}
                  <Link className="btn lp-btn" href={href}>
                    Continue editing
                  </Link>
                  <Button
                    className="lp-btn"
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
      )}
    </>
  )
}
