'use client'

import React, { useId, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
import { wireErrorMessage } from '../../lib/wireError'
import Modal from '../Modal'
import { SAVEABLE_FLAGS, type SaveableFlag } from '../../lib/systemFlagNames'
import { featuresReducer, pendingChanges, type FeatureValues } from './systemFeaturesState'

export interface FeaturesSnapshot {
  features: FeatureValues
  updatedAt: string
}

/** What each saveable switch is called, in sentences ("switch Discussions off") and on its checkbox. */
const SWITCHES: Record<SaveableFlag, { name: string; label: string; description?: string }> = {
  forumEnabled: { name: 'Discussions', label: 'Discussions enabled' },
  advancedTools: {
    name: 'Advanced tools',
    label: 'Advanced tools',
    description:
      'Shows additional editing and sharing tools. It does not change anyone’s permissions.',
  },
}
const change = (flag: SaveableFlag, enabled: boolean) =>
  `switch ${SWITCHES[flag].name} ${enabled ? 'on' : 'off'}`
const sentence = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}.`

/** The saveable switches only. Other stored flags have no enforcement yet. */
export function SystemFeaturesPanel({ initial }: { initial: FeaturesSnapshot }) {
  const { config } = useConfig()
  const router = useRouter()
  const passwordId = useId()
  const inFlight = useRef(false)
  const [state, dispatch] = useReducer(featuresReducer, {
    saved: initial.features,
    pending: initial.features,
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
        SAVEABLE_FLAGS.some((flag) => typeof result.features?.[flag] !== 'boolean')
      )
        throw new Error('Unconfirmed Save response')
      const saved = Object.fromEntries(
        SAVEABLE_FLAGS.map((flag) => [flag, result.features[flag] as boolean]),
      ) as FeatureValues
      dispatch({ type: 'saved', features: saved, updatedAt: result.updatedAt })
      setMessage(
        Object.keys(changes)
          .map(
            (flag) =>
              `${SWITCHES[flag as SaveableFlag].name} switched ${saved[flag as SaveableFlag] ? 'on' : 'off'}.`,
          )
          .join(' '),
      )
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
      {SAVEABLE_FLAGS.map((flag) => (
        <div key={flag} className="lp-manage__row lp-manage__row--tight">
          <label>
            <input
              type="checkbox"
              checked={state.pending[flag]}
              disabled={busy || needsReload}
              onChange={(event) => {
                dispatch({ type: 'toggle', flag, enabled: event.target.checked })
                setMessage(null)
              }}
            />{' '}
            {SWITCHES[flag].label}
          </label>
          {flag === 'forumEnabled' && (
            <Link href="/discuss" className="lp-manage__link">
              Moderate discussions
            </Link>
          )}
          {SWITCHES[flag].description && (
            <span className="lp-manage__fact-description">{SWITCHES[flag].description}</span>
          )}
        </div>
      ))}
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
          {Object.keys(changes).length === 1 ? 'Unsaved change: ' : 'Unsaved changes: '}
          {Object.entries(changes)
            .map(([flag, enabled]) => change(flag as SaveableFlag, enabled as boolean))
            .join('; ')}
          .
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
            {changes &&
              Object.entries(changes).map(([flag, enabled]) => (
                <p key={flag}>{sentence(change(flag as SaveableFlag, enabled as boolean))}</p>
              ))}
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
            <div className="modal__actions modal__actions--pair">
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
