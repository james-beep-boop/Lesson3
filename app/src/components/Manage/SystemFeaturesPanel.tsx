'use client'

import React, { useId, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
import { wireErrorMessage } from '../../lib/wireError'
import Modal from '../Modal'
import { featuresReducer, pendingChanges } from './systemFeaturesState'

export interface FeaturesSnapshot {
  enabled: boolean
  updatedAt: string
}

/** Only the saveable forum flag is offered. Other stored flags have no enforcement yet. */
export function SystemFeaturesPanel({ initial }: { initial: FeaturesSnapshot }) {
  const { config } = useConfig()
  const router = useRouter()
  const passwordId = useId()
  const inFlight = useRef(false)
  const [state, dispatch] = useReducer(featuresReducer, {
    saved: initial.enabled,
    pending: initial.enabled,
    updatedAt: initial.updatedAt,
  })
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const changes = pendingChanges(state)

  const close = () => {
    if (inFlight.current) return
    setPassword('')
    setOpen(false)
  }

  const save = async () => {
    if (!changes || !password || inFlight.current || needsReload) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`${apiBaseFrom(config)}/globals/system-settings/save`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, password, expectedUpdatedAt: state.updatedAt }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        const fallback =
          response.status === 401
            ? 'Your password could not be confirmed. Check it and try again.'
            : response.status === 409
              ? 'Settings changed since you loaded them. Reload before saving.'
              : response.status === 429
                ? 'Too many attempts. Wait before trying again.'
                : 'Could not save settings'
        setError(await wireErrorMessage(response, fallback))
        if (response.status === 409 || response.status >= 500) setNeedsReload(true)
        return
      }
      const result = await response.json()
      if (
        typeof result.updatedAt !== 'string' ||
        typeof result.features?.forumEnabled !== 'boolean'
      )
        throw new Error('Unconfirmed Save response')
      dispatch({
        type: 'saved',
        enabled: result.features.forumEnabled,
        updatedAt: result.updatedAt,
      })
      setMessage(`Discussions switched ${result.features.forumEnabled ? 'on' : 'off'}.`)
      setOpen(false)
      router.refresh()
    } catch {
      setNeedsReload(true)
      setError(
        'We could not confirm the Save. Reload to see the current settings before trying again.',
      )
    } finally {
      // The password is never retained for a retry, logged or placed in browser storage.
      setPassword('')
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="lp-system-features">
      <p className="lp-manage__desc">
        Changes take effect only when you save. Switching Discussions off hides the forum and its
        entry points; existing discussions are kept.
      </p>
      <div className="lp-manage__row lp-manage__row--tight">
        <label>
          <input
            type="checkbox"
            checked={state.pending}
            disabled={busy || needsReload}
            onChange={(event) => {
              dispatch({ type: 'toggle', enabled: event.target.checked })
              setMessage(null)
            }}
          />{' '}
          Discussions enabled
        </label>
        <Link href="/discuss" className="lp-manage__link">
          Moderate discussions
        </Link>
      </div>
      <Button
        className="lp-btn lp-btn--compact"
        buttonStyle="primary"
        size="small"
        disabled={!changes || busy || needsReload}
        onClick={() => {
          setError(null)
          setPassword('')
          setOpen(true)
        }}
      >
        Save
      </Button>
      {changes && (
        <p className="lp-manage__desc" role="status">
          Unsaved change: switch Discussions {state.pending ? 'on' : 'off'}.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {needsReload && !open && (
        <>
          <p className="inline-error" role="alert">
            {error}
          </p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload settings
          </button>
        </>
      )}
      {open && (
        <Modal title="Save settings" onClose={close}>
          <form
            className="modal__form"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <p>Switch Discussions {state.pending ? 'on' : 'off'}.</p>
            <label className="modal__field" htmlFor={passwordId}>
              Your password
              <input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={busy || needsReload}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={1024}
              />
            </label>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal__actions">
              <button type="button" className="btn" disabled={busy} onClick={close}>
                Cancel
              </button>
              {needsReload ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => window.location.reload()}
                >
                  Reload settings
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={busy || !password}
                  aria-busy={busy}
                >
                  {busy ? 'Saving…' : 'Save settings'}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
