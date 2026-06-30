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

import {
  groupLessons,
  matchesQuery,
  orderLessons,
  type LessonRow,
  type SubjectGradeGroup,
} from '../../lib/substrand'

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

  const query = q.trim()
  const matched = useMemo(
    () => (query ? orderLessons(rows.filter((r) => matchesQuery(r, query))) : null),
    [rows, query],
  )
  const groups = useMemo(() => (query ? null : groupLessons(rows)), [rows, query])

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
    try {
      const apiBase = `${config.serverURL || ''}${config.routes?.api || '/api'}`
      const params = new URLSearchParams()
      ;[...selected].forEach((id, i) => params.append(`where[id][in][${i}]`, id))
      const res = await fetch(`${apiBase}/lesson-plans?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = (await res.json().catch(() => null)) as
        | { docs?: unknown[]; errors?: { message: string }[] }
        | null
      if (!res.ok || (json?.errors && json.errors.length > 0)) {
        const msg = json?.errors?.[0]?.message
        toast.error(msg || `Delete failed (${res.status})`)
        return
      }
      toast.success(`Deleted ${n} lesson plan${n === 1 ? '' : 's'}.`)
      setSelected(new Set())
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
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
      ) : matched ? (
        matched.length === 0 ? (
          <p className="muted">No lesson plans match “{query}”.</p>
        ) : (
          <ul className="substrand-list">
            {matched.map((r) => (
              <Row key={r.id} row={r} canDelete={canDelete} selected={selected} toggle={toggle} showContext />
            ))}
          </ul>
        )
      ) : (
        <Catalogue groups={groups!} canDelete={canDelete} selected={selected} toggle={toggle} />
      )}
    </>
  )
}

function Catalogue({
  groups,
  canDelete,
  selected,
  toggle,
}: {
  groups: SubjectGradeGroup[]
  canDelete: boolean
  selected: Set<string>
  toggle: (id: string) => void
}) {
  return (
    <>
      {groups.map((sg) => (
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
      ))}
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
        {row.semver && <span className="lp-admin-list__badge">v{row.semver}</span>}
        {row.lessonCount} lesson{row.lessonCount === 1 ? '' : 's'}
      </span>
    </li>
  )
}
