'use client'

/**
 * Client half of the custom admin list view (see ./index.tsx). Renders the strand-grouped
 * catalogue and owns the interactive bits the server can't: the live search box, the bulk-delete
 * selection, and the DELETE call. Grouping/ordering/search reuse the pure `lib/substrand.ts`
 * helpers (no DB, importable on the client) so this view orders identically to the public page.
 *
 * Search filters client-side — the whole corpus is already loaded (the catalogue is unpaginated),
 * so there's no server round-trip. Bulk delete is one Payload REST call
 * (`DELETE /api/lesson-plans?where[id][in][n]=…`), cookie-authed and gated server-side by
 * `lessonPlanDelete` (Site-Admin only); the `cascadeDeleteLessonPlanVersions` beforeDelete hook
 * removes each plan's child versions. On success we `router.refresh()` to re-run the server view.
 */
import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { groupLessons, matchesQuery, orderLessons, type LessonRow } from '../../lib/substrand'

export function AdminLessonCatalogue({
  rows,
  canDelete,
}: {
  rows: LessonRow[]
  canDelete: boolean
}) {
  const router = useRouter()
  const { config } = useConfig()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // One derived view: searching → a flat ordered list of matches; otherwise → the grouped
  // catalogue. A single discriminated union (vs. two mutually-exclusive nullable memos) keeps the
  // render branch flat and drops the `groups!` assertion.
  const query = q.trim()
  const view = useMemo(
    () =>
      query
        ? ({ kind: 'search', rows: orderLessons(rows.filter((r) => matchesQuery(r, query))) } as const)
        : ({ kind: 'catalogue', groups: groupLessons(rows) } as const),
    [rows, query],
  )

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onDelete = async () => {
    if (selected.size === 0) return
    const n = selected.size
    if (
      !window.confirm(
        `Delete ${n} lesson plan${n === 1 ? '' : 's'}? This also removes all of their saved ` +
          `versions and cannot be undone.`,
      )
    )
      return

    setBusy(true)
    // Delete one plan at a time via the by-ID endpoint, fail-fast. Each by-ID delete is its OWN
    // transaction, so the cascade (cascadeDeleteLessonPlanVersions beforeDelete → child versions,
    // then the plan) is atomic per plan and rolls back fully on failure. Payload's BULK delete is
    // unusable here: with `bulkOperationsSingleTransaction=false` (the Postgres default) all docs
    // share one transaction that is committed even when a per-doc error is swallowed into `errors`
    // — so a failed plan delete could still commit its already-removed child versions (orphaning a
    // plan from its non-Official versions). Sequential by-ID avoids that ambiguity; the corpus is
    // small and an admin deletes a handful at a time.
    const apiBase = `${config.serverURL || ''}${config.routes?.api || '/api'}`
    let deleted = 0
    try {
      for (const id of selected) {
        const res = await fetch(`${apiBase}/lesson-plans/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { errors?: { message: string }[] } | null
          const msg = json?.errors?.[0]?.message || `Delete failed (${res.status})`
          throw new Error(deleted > 0 ? `${msg} (after deleting ${deleted})` : msg)
        }
        deleted++
      }
      toast.success(`Deleted ${deleted} lesson plan${deleted === 1 ? '' : 's'}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      // Refresh regardless — some may have committed before a mid-batch failure, so the list must
      // reflect reality. Drop the deleted ids from the selection (full success → clears it; partial
      // → leaves the not-yet-tried ids so a re-click retries only those). `selected` iterates in
      // insertion order, matching the loop, so the first `deleted` entries are the ones removed.
      if (deleted > 0) setSelected((prev) => new Set([...prev].slice(deleted)))
      router.refresh()
      setBusy(false)
    }
  }

  return (
    <>
      <div className="lp-admin-list__bar">
        <input
          className="lp-admin-list__search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lesson plans"
          aria-label="Search lesson plans"
        />
        {canDelete && (
          <Button
            buttonStyle="error"
            size="small"
            disabled={busy || selected.size === 0}
            onClick={onDelete}
          >
            {busy ? 'Deleting…' : `Delete selected${selected.size ? ` (${selected.size})` : ''}`}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="muted">No lesson plans yet.</p>
      ) : view.kind === 'search' ? (
        view.rows.length === 0 ? (
          <p className="muted">No lesson plans match “{query}”.</p>
        ) : (
          <ul className="substrand-list">
            {view.rows.map((r) => (
              <Row key={r.id} row={r} canDelete={canDelete} selected={selected} toggle={toggle} showContext />
            ))}
          </ul>
        )
      ) : (
        view.groups.map((sg) => (
          <div key={sg.key} className="sg-section">
            <h2 className="sg-head">{sg.label}</h2>
            {sg.strands.map((st) => (
              <div key={st.key} className="strand-section">
                <h3 className="strand-head">{st.label}</h3>
                <ul className="substrand-list">
                  {st.rows.map((r) => (
                    <Row key={r.id} row={r} canDelete={canDelete} selected={selected} toggle={toggle} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))
      )}
    </>
  )
}

function Row({
  row,
  canDelete,
  selected,
  toggle,
  showContext = false,
}: {
  row: LessonRow
  canDelete: boolean
  selected: Set<string>
  toggle: (id: string) => void
  showContext?: boolean
}) {
  const id = String(row.id)
  const context = [row.subjectName, row.grade != null ? `Grade ${row.grade}` : null, row.strandName]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="substrand-row">
      {canDelete && (
        <input
          type="checkbox"
          className="lp-admin-list__check"
          checked={selected.has(id)}
          onChange={() => toggle(id)}
          aria-label={`Select ${row.substrandName}`}
        />
      )}
      <Link href={`/admin/collections/lesson-plans/${id}`} className="substrand-link">
        {row.substrandId && <span className="substrand-num">{row.substrandId}</span>}
        <span className="substrand-name">
          {row.substrandName}
          {showContext && context && <span className="substrand-context">{context}</span>}
        </span>
      </Link>
      <span className="substrand-count">
        {row.semver ? (
          <>
            <span className="lp-admin-list__badge">v{row.semver}</span>
            {row.lessonCount} lesson{row.lessonCount === 1 ? '' : 's'}
          </>
        ) : (
          // No resolved Official version — flag it so an admin can repair (set a pointer) or delete.
          <span className="lp-admin-list__badge lp-admin-list__badge--warn">No Official version</span>
        )}
      </span>
    </li>
  )
}
