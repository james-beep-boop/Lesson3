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
import { personLabel, type WidgetUser } from '../../lib/widgetUser'

/** Re-exported for existing consumers; declared in `lib/widgetUser.ts` beside the code that builds it. */
export type { WidgetUser }

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
        const json = (await res.json().catch(() => null)) as {
          errors?: { message: string }[]
        } | null
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
    void changeRole(
      'assign',
      user,
      group,
      `${personLabel(user)} now has editing access for ${group.sgLabel}.`,
    )
    setPicks((p) => ({ ...p, [group.sgId]: '' }))
  }

  // ⚑ `personLabel`, not `user.name`. REVOKING access is the same kind of authorization decision as
  // granting it, and this dialog is the last thing between the administrator and the change — yet it
  // identified people by name alone, so for two teachers sharing a display name it read identically
  // for both. The reasoning that put addresses in the grant picker applies here with more force
  // (review 2026-08-02); it had been applied only where the review pointed.
  const onRemove = (group: EditorsGroup, user: WidgetUser) => {
    if (!window.confirm(`Remove editing access for ${personLabel(user)} in ${group.sgLabel}?`))
      return
    void changeRole(
      'unassign',
      user,
      group,
      `${personLabel(user)} no longer has editing access for ${group.sgLabel}.`,
    )
  }

  return (
    <div className="lp-manage__editors">
      {groups.map((group) => {
        const hasEditors = group.editors.length > 0
        const canAdd = group.addable.length > 0
        return (
          <div key={group.sgId} className="lp-manage__editors-group">
            <h3 className="lp-manage__editors-head">{group.sgLabel}</h3>
            {hasEditors && (
              <ul className="lp-manage__list">
                {group.editors.map((u) => (
                  <li key={u.id} className="lp-manage__row lp-manage__row--tight">
                    {/* Name and address on ONE line, not stacked: this list is scanned, and a second
                      line per row doubles its height for a value that is only a disambiguator. */}
                    <span className="lp-manage__who">
                      {u.name}
                      {u.email && <span className="lp-manage__who-email">{u.email}</span>}
                    </span>
                    <Button
                      className="lp-btn lp-btn--compact"
                      buttonStyle="error"
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
            {/* The empty message shares the Add row rather than stacking above it. With a full
              curriculum most subject-grades have nobody, so an empty group is the shape that
              decides whether this section is scannable — stacked it cost ~104px per group for one
              sentence and one picker (operator report 2026-08-02, "too much white space").
              Gated so a group with editors and nothing left to add emits no empty row: the wrapper
              carries a margin, so an always-rendered div would add trailing space in exactly the
              case this pass exists to tighten. */}
            {(!hasEditors || canAdd) && (
              <div className="lp-manage__editors-add">
                {!hasEditors && (
                  <span className="muted lp-manage__editors-none">No one has editing access.</span>
                )}
                {canAdd && (
                  <>
                    <select
                      className="lp-manage__select"
                      aria-label={`Grant editing access for ${group.sgLabel}`}
                      value={picks[group.sgId] ?? ''}
                      disabled={busy}
                      onChange={(e) => setPicks((p) => ({ ...p, [group.sgId]: e.target.value }))}
                    >
                      <option value="">Grant editing access…</option>
                      {/* `personLabel`, shared with the remove confirmation and the toasts — an
                      `<option>` cannot carry markup, so the string form is the shareable part while
                      the rows keep their two-node muted layout. This is the control where the
                      mistake actually happens: showing the address only on the rows below meant it
                      arrived one step too late (review 2026-08-02). */}
                      {group.addable.map((u) => (
                        <option key={u.id} value={u.id}>
                          {personLabel(u)}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="lp-btn"
                      buttonStyle="primary"
                      size="small"
                      disabled={busy || !picks[group.sgId]}
                      onClick={() => onAdd(group)}
                    >
                      Add
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
