'use client'

/**
 * Manage — Site-Admin "Delete lesson plans" panel (search → select → delete). Relocated from the
 * retired admin catalogue view; the delete semantics are carried over VERBATIM from
 * AdminLessonCatalogue: one plan at a time via the by-ID endpoint, fail-fast. Each by-ID delete is
 * its OWN transaction, so the cascade (`cascadeDeleteLessonPlanVersions` beforeDelete → child
 * versions, then the plan) is atomic per plan and rolls back fully on failure. Payload's BULK delete
 * is unusable here: with `bulkOperationsSingleTransaction=false` (the Postgres default) all docs
 * share one transaction that is committed even when a per-doc error is swallowed into `errors` — so
 * a failed plan delete could still commit its already-removed child versions. Server access
 * (`lessonPlanDelete`, Site-Admin only) remains the authority.
 */
import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'

export interface PlanRow {
  id: number
  label: string
  sgLabel: string
}

export function DeletePlansPanel({ rows }: { rows: PlanRow[] }) {
  const router = useRouter()
  const { config } = useConfig()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  const query = q.trim().toLowerCase()
  const visible = useMemo(
    () =>
      query
        ? rows.filter((r) => `${r.label} ${r.sgLabel}`.toLowerCase().includes(query))
        : rows,
    [rows, query],
  )

  const toggle = (id: number) =>
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
    const apiBase = apiBaseFrom(config)
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
    <div className="lp-manage__delete-plans">
      <div className="lp-admin-list__bar">
        <input
          className="lp-admin-list__search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lesson plans"
          aria-label="Search lesson plans to delete"
        />
        <Button
          buttonStyle="error"
          size="small"
          disabled={busy || selected.size === 0}
          onClick={() => void onDelete()}
        >
          {busy ? 'Deleting…' : `Delete selected${selected.size ? ` (${selected.size})` : ''}`}
        </Button>
      </div>
      {visible.length === 0 ? (
        <p className="muted">{query ? `No lesson plans match “${q.trim()}”.` : 'No lesson plans.'}</p>
      ) : (
        <ul className="lp-manage__list">
          {visible.map((r) => (
            <li key={r.id} className="lp-manage__row">
              <label className="lp-manage__pick">
                <input
                  type="checkbox"
                  className="lp-admin-list__check"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select ${r.label}`}
                />
                <span>{r.label}</span>
              </label>
              {r.sgLabel && <span className="lp-manage__meta">{r.sgLabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
