'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        // Payload rejects unverified accounts with the login op's ONLY 403 (UnverifiedEmail; bad
        // credentials and lockout are 401, the throttle 429 — verified in installed errors/).
        // Surface it, or a just-signed-up teacher reads "invalid password" and resets in circles.
        // Status, not message text: the copy is i18n and shifts with Payload upgrades.
        setError(
          res.status === 403
            ? 'This account isn’t verified yet — use the verification link we emailed you, then sign in.'
            : 'Invalid email or password.',
        )
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('Sign-in failed — please try again.')
    } finally {
      setBusy(false)
    }
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
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={busy}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
