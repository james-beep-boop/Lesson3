'use client'

/**
 * "I have a code from my administrator" (2026-11-01). The person types their email and the short
 * code a Site administrator gave them; a correct pair returns the reset token and we go to the
 * ordinary `/reset-password` page with it. See `endpoints/resetCode.ts`.
 *
 * Every server-side failure comes back as one message (the endpoint makes them identical), so this
 * form shows the server's text rather than guessing at a cause.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ResetCodeForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users/redeem-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        token?: unknown
        errors?: Array<{ message?: unknown }>
      }
      if (res.ok && typeof body.token === 'string') {
        router.push(`/reset-password?token=${encodeURIComponent(body.token)}`)
        return
      }
      const message = body.errors?.[0]?.message
      setError(typeof message === 'string' ? message : 'That code could not be checked.')
    } catch {
      setError('Could not reach the server — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={onSubmit} aria-label="Reset with a code">
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          disabled={busy}
        />
      </label>
      <label>
        Code from your administrator
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          disabled={busy}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Checking…' : 'Continue'}
      </button>
    </form>
  )
}
