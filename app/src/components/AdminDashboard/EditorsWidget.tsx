'use client'

/**
 * Manage — the Editors promote/demote widget (decided 2026-07-01: a compact purpose-built widget,
 * NOT the native Users table). One group per subject-grade in the caller's scope: current Editors
 * with ×Remove, plus a picker to add one (any non-site-admin user with no assignment in that
 * subject-grade — i.e. a Teacher there).
 *
 * Writes go through the narrow assignment endpoints (`POST /api/users/:id/assign-editor` /
 * `…/unassign-editor`, Codex 2026-07-01 round-2 #2) with the REQUIRED `expectedUpdatedAt` freshness
 * token — the server rejects a stale page (409) and applies a one-row delta to the FRESH user row,
 * so a concurrent admin's role change can never be silently overwritten. Authorization is entirely
 * server-side and unchanged (collection/field access + `enforceAssignmentScope`); the widget is a
 * convenience, not a policy.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'

export interface WidgetUser {
  id: number
  name: string
  /** Freshness token for the assignment endpoints — the row's updatedAt as this page rendered. */
  updatedAt: string
}

export interface EditorsGroup {
  sgId: number
  sgLabel: string
  editors: WidgetUser[]
  addable: WidgetUser[]
}

export function EditorsWidget({ groups }: { groups: EditorsGroup[] }) {
  const router = useRouter()
  const { config } = useConfig()
  const [busy, setBusy] = useState(false)
  // One pending pick per group (keyed by subject-grade id).
  const [picks, setPicks] = useState<Record<number, string>>({})

  const apiBase = apiBaseFrom(config)

  const changeRole = async (
    mode: 'assign' | 'unassign',
    user: WidgetUser,
    group: EditorsGroup,
    okMsg: string,
  ) => {
    setBusy(true)
    try {
      const res = await fetch(`${apiBase}/users/${user.id}/${mode}-editor`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectGradeId: group.sgId, expectedUpdatedAt: user.updatedAt }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { errors?: { message: string }[] } | null
        throw new Error(json?.errors?.[0]?.message || `Update failed (${res.status})`)
      }
      toast.success(okMsg)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const onAdd = (group: EditorsGroup) => {
    const userId = Number(picks[group.sgId])
    const user = group.addable.find((u) => u.id === userId)
    if (!user) return
    void changeRole('assign', user, group, `${user.name} is now an Editor for ${group.sgLabel}.`)
    setPicks((p) => ({ ...p, [group.sgId]: '' }))
  }

  const onRemove = (group: EditorsGroup, user: WidgetUser) => {
    if (!window.confirm(`Remove ${user.name} as an Editor for ${group.sgLabel}?`)) return
    void changeRole('unassign', user, group, `${user.name} is no longer an Editor for ${group.sgLabel}.`)
  }

  return (
    <div className="lp-manage__editors">
      {groups.map((group) => (
        <div key={group.sgId} className="lp-manage__editors-group">
          <h3 className="lp-manage__editors-head">{group.sgLabel}</h3>
          {group.editors.length === 0 ? (
            <p className="muted">No editors.</p>
          ) : (
            <ul className="lp-manage__list">
              {group.editors.map((u) => (
                <li key={u.id} className="lp-manage__row">
                  <span>{u.name}</span>
                  <Button
                    buttonStyle="secondary"
                    size="small"
                    disabled={busy}
                    onClick={() => onRemove(group, u)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {group.addable.length > 0 && (
            <div className="lp-manage__editors-add">
              <select
                className="lp-manage__select"
                aria-label={`Add an editor for ${group.sgLabel}`}
                value={picks[group.sgId] ?? ''}
                disabled={busy}
                onChange={(e) => setPicks((p) => ({ ...p, [group.sgId]: e.target.value }))}
              >
                <option value="">Add an editor…</option>
                {group.addable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <Button
                buttonStyle="primary"
                size="small"
                disabled={busy || !picks[group.sgId]}
                onClick={() => onAdd(group)}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
