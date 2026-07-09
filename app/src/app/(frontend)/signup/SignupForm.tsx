'use client'

/**
 * Open self-registration (2026-07-09). Standard Payload REST end to end: POST /api/users creates
 * the account (server strips any privileged fields; new users are plain Teachers), then the same
 * login POST the sign-in form uses starts the session. Server-side signup caps surface as 429s.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SignupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
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
      // Account created → start the session with the standard login op, then land on the library.
      const login = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (!login.ok) {
        // Created but not signed in (e.g. the login throttle) — the account still works.
        router.replace('/login')
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('Sign-up failed — please try again.')
    } finally {
      setBusy(false)
    }
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
