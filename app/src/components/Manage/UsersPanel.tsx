'use client'

/** Lazy Site-Admin user directory and account actions (design PR 2b). */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
// ⚑ `personLabel`, not a local `${name} (${email})`. Its docblock states the rule this panel had
// quietly broken: who a person is must not be decided in four places — and the destructive
// confirmations below are the same class of decision as the Editing-access widget's, which sits on
// this very page and was identifying the same accounts a different way.
import { plural } from '../../lib/assignmentCounts'
import { personLabel } from '../../lib/widgetUser'
import {
  grantRoleLabel,
  USER_SEARCH_TYPES,
  USER_SEARCH_TYPE_LABELS,
  type UserSearchDocument,
  type UserSearchResponse,
  type UserSearchType,
} from '../../lib/userSearchContract'
import { wireErrorMessage } from '../../lib/wireError'
import { usePanelJump, usePanelOpen } from './Accordion'
import { subjectGradeAnchor } from './panelState'

function UserRow({
  user,
  apiBase,
  onChanged,
}: {
  user: UserSearchDocument
  apiBase: string
  onChanged: () => Promise<void>
}) {
  const jumpTo = usePanelJump()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // One piece of state: the link and its lifetime are minted together and cleared together, and were
  // never independently settable.
  const [reset, setReset] = useState<{ link: string; expiresInMinutes: number | null } | null>(null)
  const [observedUpdatedAt, setObservedUpdatedAt] = useState(user.updatedAt)
  const detailId = `manage-user-${user.id}`
  const disabled = busy !== null

  // Adopt a refreshed server row before rendering it. An effect would paint the old values once and
  // then correct them; keying the component by `updatedAt` would instead destroy the disclosure
  // state after every successful action.
  if (observedUpdatedAt !== user.updatedAt) {
    setObservedUpdatedAt(user.updatedAt)
    setName(user.name)
    setEmail(user.email)
    if (user.signInDisabled) setReset(null)
  }

  const run = async (label: string, work: () => Promise<void>) => {
    if (busy) return
    setBusy(label)
    setError(null)
    try {
      await work()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `${label} failed`
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const patch = async (data: Record<string, unknown>, success: string) => {
    const response = await fetch(`${apiBase}/users/${user.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(await wireErrorMessage(response, 'Update failed'))
    toast.success(success)
    await onChanged()
  }

  const postAction = async (
    action: 'reveal-reset-link' | 'set-sign-in-disabled' | 'set-site-admin',
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const response = await fetch(`${apiBase}/users/${user.id}/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedUpdatedAt: user.updatedAt, ...data }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(await wireErrorMessage(response, 'Account action failed'))
    return (await response.json()) as Record<string, unknown>
  }

  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault()
    const nextName = name.trim()
    const nextEmail = email.trim()
    if (!nextName || !nextEmail) {
      setError('Display name and email are required.')
      return
    }
    const data: Record<string, string> = {}
    if (nextName !== user.name) data.name = nextName
    if (nextEmail !== user.email) data.email = nextEmail
    if (Object.keys(data).length === 0) return
    void run('Save profile', () => patch(data, `Updated ${nextName}.`))
  }

  const revealReset = () =>
    run('Reveal reset link', async () => {
      const body = await postAction('reveal-reset-link', {})
      const link = typeof body.link === 'string' ? body.link : null
      if (!link) throw new Error('The server returned no reset link.')
      setReset({
        link,
        expiresInMinutes: typeof body.expiresInMinutes === 'number' ? body.expiresInMinutes : null,
      })
      toast.success(`Created a password reset link for ${user.name}.`)
      await onChanged()
    })

  const toggleSiteAdmin = () => {
    const enabled = !user.siteAdmin
    const verb = enabled ? 'Grant Site Administrator to' : 'Remove Site Administrator from'
    if (!window.confirm(`${verb} ${personLabel(user)}?`)) return
    void run('Change Site Administrator', async () => {
      await postAction('set-site-admin', { enabled })
      toast.success(
        enabled
          ? `${user.name} is now a Site Administrator.`
          : `${user.name} is no longer a Site Administrator.`,
      )
      await onChanged()
    })
  }

  const toggleDisabled = () => {
    const enabled = !user.signInDisabled
    const warning = enabled
      ? `Disable sign-in for ${personLabel(user)}? Every live session will end immediately.`
      : `Re-enable sign-in for ${personLabel(user)}? They will need to sign in again.`
    if (!window.confirm(warning)) return
    void run('Change sign-in status', async () => {
      await postAction('set-sign-in-disabled', { enabled })
      setReset(null)
      toast.success(
        enabled ? `Disabled sign-in for ${user.name}.` : `Re-enabled sign-in for ${user.name}.`,
      )
      await onChanged()
    })
  }

  const deleteUser = () => {
    const consequences =
      `${personLabel(user)} authored ${plural(user.authoredVersions, 'version')}; ` +
      `${user.officialVersions} ${user.officialVersions === 1 ? 'is' : 'are'} currently Official. ` +
      'Those versions and all Official content remain, but their author attribution becomes unknown. ' +
      'Messages, favorites and edit-recovery rows are deleted. This cannot be undone.'
    if (!window.confirm(`Delete ${personLabel(user)}?\n\n${consequences}`)) return
    void run('Delete account', async () => {
      const response = await fetch(`${apiBase}/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include',
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(await wireErrorMessage(response, 'Delete failed'))
      toast.success(`Deleted ${personLabel(user)}.`)
      await onChanged()
    })
  }

  const copyResetLink = () => {
    if (!reset) return
    void navigator.clipboard
      .writeText(reset.link)
      .then(() => toast.success('Reset link copied.'))
      .catch(() => {
        setError('Could not copy automatically — select and copy the link below.')
      })
  }

  return (
    <li className="lp-users__row">
      <button
        type="button"
        className="lp-users__summary"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="lp-users__summary-main">
          <span className="lp-users__name">{user.name}</span>
          <span className="lp-users__email">{user.email}</span>
        </span>
        <span className="lp-users__summary-meta">
          {user.type}
          {user.signInDisabled ? ' · Sign-in disabled' : ''}
          {!user.verified ? ' · Unverified' : ''}
        </span>
      </button>

      <div id={detailId} className="lp-users__details" hidden={!open}>
        <form className="lp-users__profile" onSubmit={saveProfile}>
          <label className="lp-users__field">
            <span>Display name</span>
            <input
              className="lp-users__input"
              value={name}
              disabled={disabled}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="lp-users__field">
            <span>Email</span>
            <input
              className="lp-users__input"
              type="email"
              value={email}
              disabled={disabled}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <Button
            className="lp-btn"
            buttonStyle="primary"
            size="small"
            type="submit"
            disabled={disabled || (name.trim() === user.name && email.trim() === user.email)}
          >
            {busy === 'Save profile' ? 'Saving…' : 'Save profile'}
          </Button>
        </form>

        <div className="lp-users__actions" aria-label={`Account actions for ${personLabel(user)}`}>
          {!user.verified && (
            <Button
              className="lp-btn"
              buttonStyle="secondary"
              size="small"
              disabled={disabled}
              onClick={() =>
                void run('Mark verified', () =>
                  patch({ _verified: true }, `Marked ${user.name} verified.`),
                )
              }
            >
              {busy === 'Mark verified' ? 'Marking…' : 'Mark verified'}
            </Button>
          )}
          <Button
            className="lp-btn"
            buttonStyle="secondary"
            size="small"
            disabled={disabled}
            onClick={toggleSiteAdmin}
          >
            {user.siteAdmin ? 'Remove Site Administrator' : 'Make Site Administrator'}
          </Button>
          <Button
            className="lp-btn"
            buttonStyle="secondary"
            size="small"
            disabled={disabled}
            onClick={toggleDisabled}
          >
            {user.signInDisabled ? 'Enable sign-in' : 'Disable sign-in'}
          </Button>
          {!user.signInDisabled && (
            <Button
              className="lp-btn"
              buttonStyle="secondary"
              size="small"
              disabled={disabled}
              onClick={revealReset}
            >
              {busy === 'Reveal reset link' ? 'Creating link…' : 'Reveal reset link'}
            </Button>
          )}
          <Button
            className="lp-btn"
            buttonStyle="error"
            size="small"
            disabled={disabled}
            onClick={deleteUser}
          >
            {busy === 'Delete account' ? 'Deleting…' : 'Delete account'}
          </Button>
        </div>

        {reset && (
          <div className="lp-users__reset">
            <label className="lp-users__field">
              <span>
                Password reset link
                {reset.expiresInMinutes != null
                  ? ` · expires in ${reset.expiresInMinutes} minutes`
                  : ''}
              </span>
              <input
                className="lp-users__input"
                readOnly
                value={reset.link}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <Button className="lp-btn" buttonStyle="secondary" size="small" onClick={copyResetLink}>
              Copy link
            </Button>
          </div>
        )}

        <div className="lp-users__grants">
          <h3>Grants</h3>
          {user.grants.length === 0 ? (
            <p className="lp-manage__empty">No subject-grade grants.</p>
          ) : (
            <ul>
              {user.grants.map((grant, index) => (
                <li key={`${grant.subjectGradeId}-${grant.role}-${index}`}>
                  <span>
                    {grantRoleLabel(grant.role)} · {grant.subjectGradeLabel}
                  </span>
                  <button
                    type="button"
                    className="lp-users__jump"
                    onClick={() => jumpTo('users.access', subjectGradeAnchor(grant.subjectGradeId))}
                  >
                    Open access controls
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className="lp-manage__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}

export function UsersPanel() {
  // ⚑ The panel's OWN id, which stopped being `users` in the 2026-08-18 regrouping — `users` is now
  // the group this panel sits inside. Keying the lazy gate on the parent would defeat the whole
  // optimisation in the quietest possible way: opening the group would fetch, even though the panel
  // is still collapsed and nothing it renders is on screen.
  const open = usePanelOpen('users.accounts')
  const { config } = useConfig()
  const apiBase = apiBaseFrom(config)
  const [query, setQuery] = useState('')
  // The typed value and the value a request may be built from. Splitting them is what confines the
  // debounce to TYPING: with one piece of state the delay rode on `load`'s identity, so changing the
  // page or the type filter — neither of which can arrive keystroke-by-keystroke — also waited 250ms
  // for no reason, and only while a search box happened to be non-empty.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [type, setType] = useState<UserSearchType | ''>('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<UserSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())
      if (type) params.set('type', type)
      const response = await fetch(`${apiBase}/users/search?${params}`, {
        credentials: 'include',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(await wireErrorMessage(response, 'Could not load users'))
      setResult((await response.json()) as UserSearchResponse)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : 'Could not load users')
    } finally {
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    }
  }, [apiBase, debouncedQuery, page, type])

  useEffect(() => {
    if (query === debouncedQuery) return
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [debouncedQuery, query])

  useEffect(() => {
    // `query !== debouncedQuery` means a keystroke is still settling. Skipping here is what keeps a
    // page reset from firing a request the very next debounce tick would abort: typing while on page
    // 3 changes BOTH `page` and `query`, and only the second is debounced.
    if (!open || query !== debouncedQuery) return
    // Deferred by a task, not debounced: `load` sets state synchronously, which an effect body may
    // not do (react-hooks/set-state-in-effect), and the hop also coalesces a burst of dependency
    // changes into one request. The 250ms belongs to typing alone — see `debouncedQuery` above.
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [debouncedQuery, load, open, query])

  useEffect(() => () => request.current?.abort(), [])

  return (
    <div className="lp-users">
      <div className="lp-users__filters">
        <input
          className="lp-admin-list__search"
          type="search"
          aria-label="Search users by name or email"
          placeholder="Search name or email…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(1)
          }}
        />
        <select
          className="lp-manage__select"
          aria-label="Filter users by type"
          value={type}
          onChange={(event) => {
            setType(event.target.value as UserSearchType | '')
            setPage(1)
          }}
        >
          <option value="">All user types</option>
          {USER_SEARCH_TYPES.map((value) => (
            <option key={value} value={value}>
              {USER_SEARCH_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {!result && loading && <p className="lp-manage__empty">Loading users…</p>}
      {error && (
        <p className="lp-manage__error" role="alert">
          {error}{' '}
          <button type="button" className="lp-users__jump" onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}
      {result && result.docs.length === 0 && !loading && (
        <p className="lp-manage__empty">No users match this search.</p>
      )}
      {result && result.docs.length > 0 && (
        <ul className="lp-users__list" aria-busy={loading || undefined}>
          {result.docs.map((user) => (
            <UserRow key={user.id} user={user} apiBase={apiBase} onChanged={load} />
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <nav className="lp-users__pagination" aria-label="Users pages">
          <Button
            className="lp-btn lp-btn--compact"
            buttonStyle="secondary"
            size="small"
            disabled={!result.hasPrevPage || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span>
            Page {result.page} of {result.totalPages} · {plural(result.totalDocs, 'user')}
          </span>
          <Button
            className="lp-btn lp-btn--compact"
            buttonStyle="secondary"
            size="small"
            disabled={!result.hasNextPage || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  )
}
