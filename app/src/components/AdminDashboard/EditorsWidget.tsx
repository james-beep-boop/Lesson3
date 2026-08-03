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
  /**
   * The user's email address, shown to every viewer of this widget — Subject Administrators as well
   * as Site Administrators (SPEC §8 carve-out, operator decision 2026-08-02).
   *
   * Granting editing access is an authorization decision and a display name is not an identifier:
   * two teachers can share one, so a name-only list lets an administrator grant edit rights over a
   * subject's content to the wrong person with no way to notice. Rendered in BOTH places it is
   * needed — beside each current editor, and inside the grant picker's options, which is where the
   * choice is actually made.
   *
   * Optional only because a user record may genuinely lack an address; `toWidgetUser` omits the key
   * rather than emitting an empty string. It is NOT a per-role flag — see `lib/widgetUser.ts`.
   */
  email?: string
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
      `${user.name} now has editing access for ${group.sgLabel}.`,
    )
    setPicks((p) => ({ ...p, [group.sgId]: '' }))
  }

  const onRemove = (group: EditorsGroup, user: WidgetUser) => {
    if (!window.confirm(`Remove editing access for ${user.name} in ${group.sgLabel}?`)) return
    void changeRole(
      'unassign',
      user,
      group,
      `${user.name} no longer has editing access for ${group.sgLabel}.`,
    )
  }

  return (
    <div className="lp-manage__editors">
      {groups.map((group) => (
        <div key={group.sgId} className="lp-manage__editors-group">
          <h3 className="lp-manage__editors-head">{group.sgLabel}</h3>
          {group.editors.length > 0 && (
            <ul className="lp-manage__list">
              {group.editors.map((u) => (
                <li key={u.id} className="lp-manage__row lp-manage__row--tight">
                  {/* Name and address on ONE line, not stacked: this list is scanned, and a second
                      line per row doubles its height for a value that is only a disambiguator.
                      `email` is absent for Subject Admins by server projection (see WidgetUser). */}
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
              sentence and one picker (operator report 2026-08-02, "too much white space"). */}
          <div className="lp-manage__editors-add">
            {group.editors.length === 0 && (
              <span className="muted lp-manage__editors-none">No one has editing access.</span>
            )}
            {group.addable.length > 0 && (
              <>
                <select
                  className="lp-manage__select"
                  aria-label={`Grant editing access for ${group.sgLabel}`}
                  value={picks[group.sgId] ?? ''}
                  disabled={busy}
                  onChange={(e) => setPicks((p) => ({ ...p, [group.sgId]: e.target.value }))}
                >
                  <option value="">Grant editing access…</option>
                  {/* Name AND address in the option, not just the name. This is the control where
                      the mistake actually happens: granting editing access is an authorization
                      decision, and two teachers can share a display name — a name-only picker lets
                      an administrator grant edit rights over a subject's content to the wrong
                      person with nothing on screen to reveal it. Showing the address only on the
                      rows below meant it arrived one step too late (review 2026-08-02).
                      A `<option>` cannot carry markup, so this is one text node rather than the
                      muted span used in the rows. */}
                  {group.addable.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email ? `${u.name} — ${u.email}` : u.name}
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
        </div>
      ))}
    </div>
  )
}
