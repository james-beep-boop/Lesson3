'use client'

import React, { useId, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, useConfig } from '@payloadcms/ui'

import { MAX_SCHOOL_NAME_LENGTH } from '../../lib/schoolName'
import { apiBaseFrom } from '../../lib/apiBase'
import { wireErrorMessage } from '../../lib/wireError'
import Modal from '../Modal'
import { SAVEABLE_FLAGS, type SaveableFlag } from '../../lib/systemFlagNames'
import { featuresReducer, pendingChanges, type FeatureValues } from './systemFeaturesState'

export interface FeaturesSnapshot {
  schoolName?: string
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

/** School name and the saveable switches share the password-confirmed Save. */
export function SystemFeaturesPanel({ initial }: { initial: FeaturesSnapshot }) {
  const { config } = useConfig()
  const router = useRouter()
  const passwordId = useId()
  const schoolNameId = useId()
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
  const [schoolName, setSchoolName] = useState(initial.schoolName ?? '')
  const [savedSchoolName, setSavedSchoolName] = useState(initial.schoolName ?? '')
  const flagChanges = pendingChanges(state)
  const nameChanged = schoolName.trim() !== savedSchoolName
  const changes =
    flagChanges || nameChanged
      ? { ...flagChanges, ...(nameChanged ? { schoolName: schoolName.trim() } : {}) }
      : null
  const summary = (key: string, value: boolean | string) =>
    key === 'schoolName'
      ? value
        ? `set school name to “${value}”`
        : 'clear the school name'
      : change(key as SaveableFlag, value as boolean)

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
      if (nameChanged && typeof result.schoolName !== 'string')
        throw new Error('Unconfirmed school name')
      if (nameChanged) {
        setSavedSchoolName(result.schoolName)
        setSchoolName(result.schoolName)
      }
      const saved = Object.fromEntries(
        SAVEABLE_FLAGS.map((flag) => [flag, result.features[flag] as boolean]),
      ) as FeatureValues
      dispatch({ type: 'saved', features: saved, updatedAt: result.updatedAt })
      setMessage(
        Object.keys(changes)
          .map((flag) =>
            flag === 'schoolName'
              ? 'School name saved.'
              : `${SWITCHES[flag as SaveableFlag].name} switched ${saved[flag as SaveableFlag] ? 'on' : 'off'}.`,
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
      <div className="lp-manage__row lp-manage__row--tight">
        <label htmlFor={schoolNameId}>School name</label>
        <input
          id={schoolNameId}
          className="lp-users__input"
          type="text"
          value={schoolName}
          maxLength={MAX_SCHOOL_NAME_LENGTH}
          disabled={busy || needsReload}
          onChange={(event) => {
            setSchoolName(event.target.value)
            setMessage(null)
          }}
        />
        <span className="lp-manage__fact-description">
          Shown on sign-in, browser tabs, the account menu and main page headings. Leave empty to
          hide it.
        </span>
      </div>
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
            .map(([flag, enabled]) => summary(flag, enabled as boolean | string))
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
                <p key={flag}>{sentence(summary(flag, enabled as boolean | string))}</p>
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
