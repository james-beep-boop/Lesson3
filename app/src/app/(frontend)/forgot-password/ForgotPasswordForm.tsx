'use client'

/**
 * Standard Payload forgot-password (2026-07-09): POST /api/users/forgot-password emails a reset
 * link to the FRONTEND /reset-password page (Users.auth.forgotPassword.generateEmailHTML). The
 * response is deliberately the same whether or not the account exists (no existence oracle), and
 * the operation is rate-capped per address + globally (#42).
 */
import React, { useState } from 'react'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.status === 429) {
        setError('Too many reset requests — please try again later.')
        return
      }
      setSent(true) // same outcome whether or not the account exists
    } catch {
      setError('Could not send the request — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <p className="login-note" role="status">
        If an account exists for that address, a reset link is on its way. Check your inbox.
      </p>
    )
  }
  return (
    <form className="login-form" onSubmit={onSubmit}>
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
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Email me a reset link'}
      </button>
    </form>
  )
}
