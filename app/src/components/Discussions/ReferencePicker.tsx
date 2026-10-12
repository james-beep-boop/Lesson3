'use client'

/**
 * "Add lesson reference" — one saved version per post (§16.2), chosen as a lesson, then one of its
 * versions (operator decision 2026-10-10).
 *
 * ⚑ EXISTING REST ONLY, AS THE VIEWER. Both lists come from Payload's own `GET /api/lesson-plans` and
 * `GET /api/lesson-bundle-versions`, under the caller's ordinary read access — the same rule
 * `findReadableVersions` applies — so this adds no authorization boundary (4a contract). Version authors
 * come back NAMES ONLY (`populate[users][name]`); the server still decides, at create, whether the chosen
 * version is readable (`refVersion` → 400 otherwise).
 */
import React, { useEffect, useId, useState } from 'react'

import { displayTitle } from '@/lib/displayTitle'
import { refLabelFor } from '@/lib/discussionText'
import { lessonSearchPath, lessonVersionsPath } from './referencePickerQueries'

export interface ChosenReference {
  versionId: number
  label: string
}

interface PlanHit {
  id: number
  title: string
}

interface VersionHit {
  id: number
  semver: string
  title?: string | null
  createdAt: string
  meta?: { substrand_name?: string | null } | null
  author?: { name?: string | null } | number | null
}

async function getDocs<T>(path: string): Promise<T[]> {
  const res = await fetch(path, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(String(res.status))
  return ((await res.json()) as { docs?: T[] }).docs ?? []
}

const findPlans = (query: string) => getDocs<PlanHit>(lessonSearchPath(query))
const findVersions = (planId: number) => getDocs<VersionHit>(lessonVersionsPath(planId))

const authorOf = (v: VersionHit): string | null =>
  v.author && typeof v.author === 'object' ? (v.author.name ?? null) : null

export default function ReferencePicker({
  value,
  onChange,
  onPendingChange,
  disabled,
}: {
  value: ChosenReference | null
  onChange: (next: ChosenReference | null) => void
  onPendingChange: (pending: boolean) => void
  disabled: boolean
}) {
  // Opening the picker expresses intent to attach a reference. Only choosing a version or explicitly
  // cancelling clears the composer's pending flag; a lookup finishing (or failing) does not.
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Results are kept with the query they answer, so a stale answer is never shown for a newer query.
  const [found, setFound] = useState<{ query: string; plans: PlanHit[] } | null>(null)
  const [plan, setPlan] = useState<PlanHit | null>(null)
  const [versions, setVersions] = useState<VersionHit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()

  // Search as the teacher types, after a short pause; the newest query wins.
  useEffect(() => {
    if (!open || plan) return
    const q = query.trim()
    if (q.length < 2) return
    let live = true
    const timer = setTimeout(() => {
      findPlans(q)
        .then((hits) => live && (setFound({ query: q, plans: hits }), setError(null)))
        .catch(() => live && setError('Lessons could not be searched. Try again.'))
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [open, plan, query])

  useEffect(() => {
    if (!plan) return
    let live = true
    findVersions(plan.id)
      .then((hits) => live && (setVersions(hits), setError(null)))
      .catch(() => live && setError('The versions could not be loaded. Try again.'))
    return () => {
      live = false
    }
  }, [plan])

  // What the list shows: only the answer to the query as it reads NOW (two or more characters).
  const plans = found && found.query === query.trim() ? found.plans : null

  // Choosing (or un-choosing) a lesson clears its versions here, in the event — not in the effect.
  const choosePlan = (next: PlanHit | null) => {
    setVersions(null)
    setPlan(next)
    setError(null)
  }

  const reset = () => {
    onPendingChange(false)
    setOpen(false)
    setQuery('')
    setFound(null)
    choosePlan(null)
    setError(null)
  }

  if (value) {
    return (
      <div className="disc-picker">
        <span className="disc-picker__label">Lesson reference:</span> <strong>{value.label}</strong>{' '}
        <button
          type="button"
          className="btn btn--quiet btn--compact"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          Remove
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="disc-picker">
        <button
          type="button"
          className="btn"
          onClick={() => {
            onPendingChange(true)
            setOpen(true)
          }}
          disabled={disabled}
        >
          Add lesson reference
        </button>
      </div>
    )
  }

  return (
    <fieldset className="disc-picker disc-picker--open" disabled={disabled}>
      <legend>Add lesson reference</legend>
      <p className="muted" role="status">
        Choose a lesson version before posting, or cancel to post without a lesson reference.
      </p>
      {!plan ? (
        <>
          <label htmlFor={inputId} className="disc-picker__label">
            Find a lesson by its title
          </label>
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            maxLength={200}
            autoFocus
          />
          {plans && plans.length === 0 && <p className="muted">No lessons match.</p>}
          {plans && plans.length > 0 && (
            <ul className="disc-picker__list">
              {plans.map((p) => (
                <li key={p.id}>
                  <button type="button" className="btn btn--quiet" onClick={() => choosePlan(p)}>
                    {displayTitle(p.title ?? 'Lesson plan')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="disc-picker__label">
            Choose a version of <strong>{displayTitle(plan.title ?? 'Lesson plan')}</strong>{' '}
            <button
              type="button"
              className="btn btn--quiet btn--compact"
              onClick={() => choosePlan(null)}
            >
              Choose another lesson
            </button>
          </p>
          {versions === null && !error && <p className="muted">Loading versions…</p>}
          {versions && versions.length === 0 && (
            <p className="muted">There are no versions of this lesson you can open.</p>
          )}
          {versions && versions.length > 0 && (
            <ul className="disc-picker__list">
              {versions.map((v) => {
                const author = authorOf(v)
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="btn btn--quiet"
                      onClick={() => {
                        onChange({ versionId: v.id, label: refLabelFor(v) })
                        reset()
                      }}
                    >
                      v{v.semver} ·{' '}
                      {new Date(v.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                      {author ? ` · ${author}` : ''}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
      {error && (
        <p className="inline-error" role="status">
          {error}
        </p>
      )}
      <button type="button" className="btn btn--quiet btn--compact" onClick={reset}>
        Cancel
      </button>
    </fieldset>
  )
}
