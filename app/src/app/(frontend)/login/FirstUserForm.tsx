'use client'

import React, { useState } from 'react'

import PasswordInput from '@/components/PasswordInput'

/**
 * Fresh-install bootstrap through Payload's native first-register operation. The operation verifies
 * user #1 without an emailed link and signs them in; `grantSiteAdminToFirstUser` supplies the Site
 * Administrator role and serializes the one-shot boundary in the same transaction.
 */
export function FirstUserForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/users/first-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      })
      if (!response.ok) {
        setError(
          response.status === 403
            ? 'Initial setup has already been completed. Reload this page to sign in.'
            : 'Could not create the Site administrator. Check the details and try again.',
        )
        return
      }
      window.location.replace('/admin')
    } catch {
      setError('Setup failed - please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="login-note">
        Create the first Site administrator. The email address is the sign-in name; setup does not
        require receiving an email.
      </p>
      <form className="login-form" onSubmit={onSubmit}>
        <label>
          Display name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            disabled={busy}
          />
        </label>
        <label>
          Email address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="username"
            disabled={busy}
          />
        </label>
        <label>
          Password
          <PasswordInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            disabled={busy}
          />
        </label>
        <label>
          Confirm password
          <PasswordInput
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
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
          {busy ? 'Creating administrator...' : 'Create Site administrator'}
        </button>
      </form>
    </>
  )
}
