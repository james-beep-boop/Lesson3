'use client'

/**
 * Manage — a list of saved versions, used twice: "My saved versions" (the caller's own, every role)
 * and "Delete individual versions" (an administrator's cleanup queue). The label opens the version in
 * the editor, with edit intent (`?edit=1` — click resumes editing, decided 2026-07-01) only where the
 * caller may edit; Compare to Official opens the existing saved-version comparison in a new tab; and
 * Delete removes it after a confirm (`DELETE /api/lesson-bundle-versions/:id` — the server access +
 * Official guard remain the authority) before refreshing the server view.
 *
 * ⚑ EVERY ACTION IS A PER-ROW DECISION THE SERVER MADE (Proposal B, 2026-10-22). The cleanup queue's
 * rows are all deletable, non-Official and editable by construction, but a person's own list mixes
 * Officials, revoked subject-grades and ordinary versions (`lib/personalVersions.ts`), so a role-wide
 * switch could not say what one row allows. `showContinueEditing` stays list-wide for one reason: on
 * the cleanup queue an administrator can edit every row, yet the duplicate button is omitted there.
 */
import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
import { matchesTokenAnd, tokenise } from '../../lib/substrand'
import CompareToOfficialLink from '../CompareToOfficialLink'
import { withUnsavedWarning } from '../EditRecovery/unsavedWarning'

export interface CandidateRow {
  id: number
  lessonPlanId: number | null
  /** The Compare to Official baseline, set by the server only for a KNOWN non-Official row
   *  (`versionActions`); null means no Compare. */
  officialVersionId: number | null
  label: string
  semver: string
  sgLabel: string
  authorName: string | null
  savedAt: string
  /** Display only ("Official" in the details line). Never derive an action from it: the server
   *  decided `canDelete` and the baseline above with an unresolved plan permitting neither. */
  isOfficial: boolean
  canDelete: boolean
  canEdit: boolean
}

export function CandidateList({
  rows,
  emptyText,
  showAuthor,
  showContinueEditing,
  searchLabel,
}: {
  rows: CandidateRow[]
  emptyText: string
  showAuthor: boolean
  showContinueEditing: boolean
  /** The search box's accessible name — distinct per list, since an administrator's page has two. */
  searchLabel: string
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
    // Held across the warning lookup, so a second click cannot open a second confirmation.
    setBusyId(row.id)
    // Deleting a version discards the unsaved work kept on it (SPEC §5) — say so when there is some.
    const question = await withUnsavedWarning(
      `Delete “${row.label}” v${row.semver}? This cannot be undone.`,
      row.id,
      { apiBase },
    )
    if (!window.confirm(question)) {
      setBusyId(null)
      return
    }
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
          aria-label={searchLabel}
          placeholder={`${searchLabel}…`}
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
            // Edit intent only where the caller may edit: elsewhere (a subject-grade whose editing
            // access was revoked) the title opens the version to read.
            const href = `/admin/collections/lesson-bundle-versions/${row.id}${row.canEdit ? '?edit=1' : ''}`
            // One metadata LINE, not a row of floating chips. The version is ordinary metadata here:
            // it used to render as `.lp-admin-list__badge`, which gave a piece of status the shape of a
            // control — exactly what the button system's "status is not a variant" rule forbids. For
            // the same reason "Official" is a word in that line, as in the Versions list, not a badge.
            const meta = [
              row.sgLabel,
              `Version ${row.semver}`,
              row.isOfficial ? 'Official' : null,
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
                {/* "My saved versions" gets a named return path to the caller's own work. The cleanup
                queue — other people's versions — omits that duplicate action; its title remains a
                quiet link to the same editor if an exceptional inspection is needed. */}
                <div className="lp-manage__row-actions">
                  {/* The server sets a baseline only for a KNOWN non-Official row: an Official
                      compared with itself says nothing, and an unknown state must not be guessed. */}
                  {row.officialVersionId != null && row.lessonPlanId != null && (
                    <CompareToOfficialLink
                      className="btn lp-btn"
                      planId={row.lessonPlanId}
                      officialVersionId={row.officialVersionId}
                      candidateVersionId={row.id}
                    />
                  )}
                  {showContinueEditing && row.canEdit && (
                    <Link className="btn lp-btn" href={href}>
                      Continue editing
                    </Link>
                  )}
                  {row.canDelete && (
                    <Button
                      className="lp-btn"
                      buttonStyle="error"
                      size="small"
                      disabled={busyId != null}
                      onClick={() => void onDelete(row)}
                    >
                      {busyId === row.id ? 'Deleting…' : 'Delete'}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
