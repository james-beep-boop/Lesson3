'use client'

/**
 * Change your own display name, from inside the avatar dropdown (D4,
 * `docs/DESIGN-manage-accordion-2026-08-16.md`).
 *
 * WHY HERE AND NOT A "MY ACCOUNT" PANEL ON MANAGE: Manage is unreachable by plain Teachers
 * (`canUseAdminPanel`), who are most users — account self-service placed there would be invisible to
 * the people most likely to want it. Once email and password change are excluded (both already
 * blocked at field level), such a panel reduces to exactly this one field, and the avatar menu is
 * shared by BOTH surfaces.
 *
 * ⚑ ITS OWN COMPONENT, so the edit state DIES WITH THE FORM. `UserMenu` renders its dropdown with
 * `{open && …}`, so holding `editing`/`draft`/`saving`/`error` in the parent meant closing and
 * reopening the menu returned you to a half-typed field with a stale error — state outliving the UI
 * it belongs to. Unmounting resets all four for free, which is also why a failed save needs no
 * explicit `draft` reset.
 *
 * No new endpoint: `name.access.update` is already `selfOrSiteAdminField`, so the plain REST route
 * is correctly authorised for self-edit, and the server stays the authority regardless.
 */
import React, { useState } from 'react'

export function DisplayNameForm({
  userId,
  displayName,
}: {
  userId: number
  /** The current name — the starting value, and what Cancel returns to. */
  displayName: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const beginEditing = () => {
    setDraft(displayName)
    setError(null)
    setEditing(true)
  }
  const exitEditing = () => {
    setDraft(displayName)
    setError(null)
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button type="button" className="user-menu__item" onClick={beginEditing}>
        Change display name
      </button>
    )
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = draft.trim()
    // A blank name would leave the avatar with no initials and every author line empty. Refused here
    // as well as server-side, where the field is required — this one is for the message, not the rule.
    if (!name) {
      setError('Enter a display name.')
      return
    }
    if (name === displayName) {
      exitEditing()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        // Without a bound, one lost connection leaves Save and Cancel disabled forever.
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          errors?: { message: string }[]
        } | null
        throw new Error(json?.errors?.[0]?.message || `Could not save (${res.status})`)
      }
      // A full reload rather than `router.refresh()`: the name is rendered by BOTH root layouts (the
      // frontend header and the admin header) and this component is shared by both, so there is no
      // single router whose refresh updates every surface the name appears on.
      window.location.reload()
    } catch (err) {
      const timedOut =
        err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')
      setError(
        timedOut
          ? 'Saving took too long — please try again.'
          : err instanceof Error
            ? err.message
            : 'Could not save',
      )
      setSaving(false)
    }
  }

  return (
    <form className="user-menu__edit" onSubmit={onSubmit}>
      <label className="user-menu__edit-label" htmlFor="user-menu-name">
        Display name
      </label>
      <input
        id="user-menu-name"
        className="user-menu__edit-input"
        value={draft}
        autoFocus
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
      />
      {/* Errors are text in the menu, not a toast: the toast host is per-surface, and this component
          renders on both. */}
      {error && (
        <p className="user-menu__edit-error" role="alert">
          {error}
        </p>
      )}
      <div className="user-menu__edit-actions">
        <button type="submit" className="user-menu__edit-btn" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="user-menu__edit-btn"
          disabled={saving}
          onClick={exitEditing}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
