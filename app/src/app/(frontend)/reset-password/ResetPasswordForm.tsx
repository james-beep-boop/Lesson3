'use client'

/**
 * Standard Payload reset-password (2026-07-09): POST /api/users/reset-password with the emailed
 * token + the new password. On success Payload signs the user in (sets the auth cookie), so we
 * land straight on the library.
 */
import React, { useState } from 'react'

import PasswordInput from '@/components/PasswordInput'

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password }),
      })
      if (!res.ok) {
        setError('This reset link is invalid or has expired — request a new one.')
        return
      }
      // Payload has just signed the user in, so this is an auth transition: same
      // one-document-navigation rule as LoginForm, for the reason documented there.
      window.location.replace('/')
    } catch {
      setError('Could not reset the password — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      <label>
        New password
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          disabled={busy}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}
