'use client'

/**
 * Open self-registration (2026-07-09). Standard Payload REST end to end: POST /api/users creates
 * the account (server strips any privileged fields; new users are plain Teachers). With email
 * verification on (auth.verify), the account can't sign in until the emailed link is used — so
 * success shows a check-your-email note instead of starting a session (a login attempt here
 * would just 403 UnverifiedEmail). Server-side signup caps surface as 429s.
 *
 * ⚑ WITHOUT EMAIL (no SMTP — an offline school server) no link is ever sent: the account waits for a
 * Site Administrator to approve it (Manage → Users → Accounts). The form says that BEFORE the teacher
 * signs up and again after, rather than promising an email that cannot arrive (2026-10-19).
 */
import React, { useState } from 'react'

import PasswordInput from '@/components/PasswordInput'

export function SignupForm({ emailEnabled = true }: { emailEnabled?: boolean }) {
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
      // Account created — unverified until the emailed link is used (or, without email, until a Site
      // Administrator approves it), so no login attempt here.
      setDone(true)
    } catch {
      setError('Sign-up failed — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return emailEnabled ? (
      <p className="login-note" role="status">
        Account created — we&apos;ve emailed a verification link to <strong>{email}</strong>. Follow
        it to activate your account, then sign in.
      </p>
    ) : (
      <p className="login-note" role="status">
        Account created for <strong>{email}</strong>. Before you can sign in, your school&apos;s
        Site Administrator needs to approve it. Let them know you have signed up. Once they approve
        it, sign in with this email address and your password.
      </p>
    )
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      {!emailEnabled && (
        <p className="login-note">
          This site does not send email. After you sign up, your school&apos;s Site Administrator
          approves your account, then you can sign in. Your email address is your sign-in name, so
          use one you will remember.
        </p>
      )}
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
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
