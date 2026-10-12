'use client'

/**
 * "Request editing access" (teacher-first T3): shown to viewers WITHOUT edit rights on a lesson's
 * subject-grade. One click messages the right admins server-side (the roster is names-only, so
 * the teacher never needs to know who they are). The server enforces one request per
 * subject-grade per day — a repeat click surfaces its friendly 429 message.
 */
import React, { useState } from 'react'

export default function RequestEditingButton({ planId }: { planId: number | string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    if (state !== 'idle') return
    setState('sending')
    setError(null)
    try {
      const res = await fetch(`/api/lesson-plans/${planId}/request-editing`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] }
        throw new Error(body.errors?.[0]?.message ?? 'Could not send the request.')
      }
      setState('sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request.')
      setState('idle')
    }
  }

  if (state === 'sent') {
    return <span className="muted">Request sent — an administrator will be in touch.</span>
  }
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={state === 'sending'}
        aria-busy={state === 'sending'}
        onClick={onClick}
      >
        {state === 'sending' ? 'Sending…' : 'Request editing access'}
      </button>
      {error && (
        <span role="alert" className="inline-error">
          {error}
        </span>
      )}
    </>
  )
}
