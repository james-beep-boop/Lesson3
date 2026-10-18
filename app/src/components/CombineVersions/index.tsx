'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@payloadcms/ui'
import Modal from '../Modal'
import { renderOf } from '../EditRecovery/restoreDiff'
import { withDeadline } from '../EditRecovery/deadline'
import { conflictKey, type CombineContext } from '../../lib/combine/draft'
import type { CombineConflict, CombinePlan } from '../../lib/combine/engine'
import { projectCapture } from '../../lib/editRecovery/projection'
import { editingAvailableAtWidth } from '../../lib/editingViewport'

export type VersionChoice = { id: number; semver?: string | null }
export type Comparison = {
  a: VersionChoice
  b: VersionChoice
  base: VersionChoice | null
  plan: CombinePlan
  alreadyIncluded?: 'a' | 'b' | null
}

export async function loadComparison(id: number, other: number): Promise<Comparison> {
  return withDeadline(15_000, async (signal) => {
    const response = await fetch(
      `/api/lesson-bundle-versions/${id}/combine-preview?with=${other}`,
      { credentials: 'same-origin', signal },
    )
    if (!response.ok) throw new Error('Could not load the comparison. Try again.')
    return response.json() as Promise<Comparison>
  })
}

export function nothingToCombine(comparison: Comparison): string | null {
  const { plan, a, b, alreadyIncluded } = comparison
  if (!plan.ok || plan.conflicts.length) return null
  if (alreadyIncluded) {
    const newer = alreadyIncluded === 'a' ? a : b
    const older = alreadyIncluded === 'a' ? b : a
    return `Version ${newer.semver} already includes everything in ${older.semver}. Nothing to combine.`
  }
  return Object.keys(plan.overlay).length === 0 ? 'Nothing to combine.' : null
}

export default function CombineVersions({
  id,
  versions,
  document,
  editing,
  available,
  busy,
  comparison,
  context,
  remaining,
  onBegin,
  onResolve,
  valueFor,
  onMessage,
  onNarrow,
}: {
  id: number
  versions: VersionChoice[]
  document: Record<string, unknown>
  editing: boolean
  available: boolean
  busy: boolean
  comparison: Comparison | null
  context: CombineContext | null
  remaining: number
  onBegin: (comparison: Comparison) => void
  onResolve: (conflict: CombineConflict, value: string) => void
  valueFor: (conflict: CombineConflict) => string
  onMessage: (message: string) => void
  onNarrow: () => void
}) {
  const savedProjection = useMemo(() => projectCapture(document), [document])
  const [open, setOpen] = useState(false)
  const [other, setOther] = useState('')
  const [review, setReview] = useState<Comparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [custom, setCustom] = useState<string[]>([])
  const read = async (otherId: number) => {
    setLoading(true)
    setError(null)
    try {
      setReview(await loadComparison(id, otherId))
    } catch {
      setError('Could not load the comparison. Try again.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    const second = Number(new URLSearchParams(window.location.search).get('combineWith'))
    if (!available || !second || editing) return
    // A full version switch carries ids only. No teacher text is persisted in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true)
    void loadComparison(id, second)
      .then(setReview)
      .catch(() => onMessage('Could not load the comparison. Try again.'))
    // The document controls remount on the full version switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, available])
  const close = () => {
    if (!loading) {
      setOpen(false)
      setReview(null)
      // Consume the version-switch handoff so reloading a kept draft offers normal restoration.
      const url = new URL(window.location.href)
      if (url.searchParams.has('combineWith')) {
        url.searchParams.delete('combineWith')
        window.history.replaceState(
          window.history.state,
          '',
          `${url.pathname}${url.search}${url.hash}`,
        )
      }
    }
  }
  const plan = comparison?.plan
  return (
    <>
      {available && !editing && versions.length >= 2 && (
        <Button
          size="small"
          buttonStyle="secondary"
          onClick={() => {
            if (!editingAvailableAtWidth(window.innerWidth)) {
              onNarrow()
              return
            }
            setOpen(true)
          }}
        >
          Combine versions
        </Button>
      )}
      {open && (
        <Modal title="Combine versions" onClose={close} className="modal--combine">
          {error && <p role="alert">{error}</p>}
          {!review ? (
            <>
              <label>
                Choose another version
                <select
                  aria-label="Choose another version"
                  value={other}
                  onChange={(event) => setOther(event.target.value)}
                  disabled={loading}
                >
                  <option value="" />
                  {versions
                    .filter((v) => v.id !== id)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.semver}
                      </option>
                    ))}
                </select>
              </label>
              <Button disabled={!other || loading} onClick={() => void read(Number(other))}>
                Review combination
              </Button>
            </>
          ) : (
            <>
              <h3>
                Combine version {review.a.semver} with version {review.b.semver}
              </h3>
              {!review.plan.ok ? (
                <p>{review.plan.message}</p>
              ) : nothingToCombine(review) ? (
                <p>{nothingToCombine(review)}</p>
              ) : (
                <>
                  <p>
                    {review.base && review.plan.ancestry === 'three-way'
                      ? `Based on shared version ${review.base.semver}.`
                      : 'No usable common version was found. Choose which text to keep wherever these versions differ.'}
                  </p>
                  <h4>Changes combined automatically</h4>
                  {review.plan.changes.map((change) => (
                    <div key={conflictKey(change)} className="lp-combine__change">
                      <strong>
                        {change.heading} — {change.label}
                      </strong>
                      {(() => {
                        if (!review.plan.ok) return null
                        const now = review.plan.overlay[change.key]?.[change.field] ?? ''
                        if (review.plan.start === 'b') return <pre>{now}</pre>
                        const rendered = renderOf(
                          savedProjection[change.key]?.[change.field] ?? '',
                          now,
                          false,
                        )
                        return rendered.kind === 'diff' ? (
                          <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
                        ) : (
                          <p>
                            {rendered.kind === 'emptied'
                              ? 'Emptied'
                              : rendered.kind === 'paragraphs'
                                ? 'Paragraph breaks changed — the words are the same'
                                : rendered.kind === 'spacing'
                                  ? 'Spacing only — no visible change'
                                  : rendered.text}
                          </p>
                        )
                      })()}
                    </div>
                  ))}
                  <p>Fields needing your choice: {review.plan.conflicts.length}</p>
                  {review.plan.conflicts.map((c) => (
                    <div key={conflictKey(c)}>
                      <strong>
                        {c.heading} — {c.label}
                      </strong>
                      <strong>{review.a.semver}</strong>
                      <pre>{c.a}</pre>
                      <strong>{review.b.semver}</strong>
                      <pre>{c.b}</pre>
                    </div>
                  ))}
                  {review.plan.start === 'b' && (
                    <p>
                      Continue in version {review.b.semver} to preserve its plan details and answer
                      keys.
                    </p>
                  )}
                  <p>Review the result, then save it as a new version.</p>
                  <Button
                    onClick={() => {
                      if (!review.plan.ok) return
                      const start = review.plan.start === 'a' ? review.a : review.b
                      const second = review.plan.start === 'a' ? review.b : review.a
                      if (start.id !== id) {
                        // Full navigation deliberately drops the old Payload form and its row ids.
                        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                        window.location.assign(
                          `/admin/collections/lesson-bundle-versions/${start.id}?combineWith=${second.id}`,
                        )
                        return
                      }
                      onBegin(review)
                      close()
                    }}
                  >
                    Continue in editor
                  </Button>
                </>
              )}
            </>
          )}
          <Button buttonStyle="secondary" onClick={close} disabled={loading}>
            Cancel
          </Button>
        </Modal>
      )}
      {editing && context && comparison && (
        <section className="lp-combine" aria-label="Review combination">
          {!plan?.ok ? (
            <p>{plan && !plan.ok ? plan.message : 'Could not load the comparison. Try again.'}</p>
          ) : (
            <>
              <h3>
                Combine version {comparison.a.semver} with version {comparison.b.semver}
              </h3>
              <p aria-live="polite">Fields needing your choice: {remaining}</p>
              {remaining > 0 && <p>Choose text for every remaining field before saving.</p>}
              {plan.conflicts.map((conflict) => {
                const key = conflictKey(conflict)
                const isCustom = custom.includes(key)
                return (
                  <fieldset key={key} disabled={busy}>
                    <legend>
                      {conflict.heading} — {conflict.label}
                    </legend>
                    <strong>{comparison.a.semver}</strong>
                    <pre>{conflict.a}</pre>
                    <strong>{comparison.b.semver}</strong>
                    <pre>{conflict.b}</pre>
                    <Button
                      buttonStyle="secondary"
                      aria-pressed={
                        !isCustom &&
                        context.resolvedKeys.includes(key) &&
                        valueFor(conflict) === conflict.a
                      }
                      onClick={() => {
                        setCustom((keys) => keys.filter((k) => k !== key))
                        onResolve(conflict, conflict.a)
                      }}
                    >
                      Use {comparison.a.semver}’s text
                    </Button>
                    <Button
                      buttonStyle="secondary"
                      aria-pressed={
                        !isCustom &&
                        context.resolvedKeys.includes(key) &&
                        valueFor(conflict) === conflict.b
                      }
                      onClick={() => {
                        setCustom((keys) => keys.filter((k) => k !== key))
                        onResolve(conflict, conflict.b)
                      }}
                    >
                      Use {comparison.b.semver}’s text
                    </Button>
                    <Button
                      buttonStyle="secondary"
                      onClick={() => {
                        setCustom((keys) => [...keys.filter((k) => k !== key), key])
                        onResolve(conflict, plan.start === 'a' ? conflict.a : conflict.b)
                      }}
                    >
                      Write my own
                    </Button>
                    {isCustom && (
                      <label>
                        Start with version{' '}
                        {plan.start === 'a' ? comparison.a.semver : comparison.b.semver}’s text,
                        then make your changes.
                        <textarea
                          aria-label={`${conflict.heading} — ${conflict.label}`}
                          value={valueFor(conflict)}
                          onChange={(event) => onResolve(conflict, event.target.value)}
                        />
                      </label>
                    )}
                  </fieldset>
                )
              })}
            </>
          )}
        </section>
      )}
    </>
  )
}
