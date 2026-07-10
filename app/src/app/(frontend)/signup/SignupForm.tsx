'use client'

/**
 * Open self-registration (2026-07-09). Standard Payload REST end to end: POST /api/users creates
 * the account (server strips any privileged fields; new users are plain Teachers). With email
 * verification on (auth.verify), the account can't sign in until the emailed link is used — so
 * success shows a check-your-email note instead of starting a session (a login attempt here
 * would just 403 UnverifiedEmail). Server-side signup caps surface as 429s.
 */
import React, { useState } from 'react'

export function SignupForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] }
        const msg = body.errors?.[0]?.message ?? ''
        setError(
          res.status === 429
            ? msg || 'Too many sign-up attempts — please try again tomorrow.'
            : /email/i.test(msg)
              ? 'An account with this email may already exist — try signing in instead.'
              : msg || 'Could not create the account — please check the details and try again.',
        )
        return
      }
      // Account created — unverified until the emailed link is used, so no login attempt here.
      setDone(true)
    } catch {
      setError('Sign-up failed — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="login-note">
        Account created — we&apos;ve emailed a verification link to <strong>{email}</strong>. Follow
        it to activate your account, then sign in.
      </p>
    )
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      <label>
        Display name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          disabled={busy}
        />
      </label>
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
          minLength={8}
          autoComplete="new-password"
          disabled={busy}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
