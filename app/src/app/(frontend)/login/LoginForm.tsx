'use client'

import React, { useState } from 'react'

import PasswordInput from '@/components/PasswordInput'
import { ACCOUNT_DISABLED_CODE, readErrorCode } from '@/errors/AccountDisabled'

/**
 * Which failure the reader is looking at. A named function rather than a nested ternary inside
 * `setError`, so the three-way choice is readable and unit-testable without a DOM.
 */
function signInErrorMessage(code: string | undefined, status: number): string {
  if (code === ACCOUNT_DISABLED_CODE) return 'This account is disabled — contact an administrator.'
  // ⚑ 403 NO LONGER HAS ONE CAUSE, which is why the code is checked first. This branch used to read
  // "the login op's ONLY 403 is UnverifiedEmail (bad credentials and lockout are 401, the throttle
  // 429)" and map every 403 to the verification message. That was correct while it held — the
  // `signInDisabled` gate (D13a) added a SECOND 403 to the same operation, which would have sent a
  // disabled user hunting for a verification email that does not exist.
  //
  // Still never message TEXT: the copy is i18n and shifts with Payload upgrades, while `data.code`
  // is a contract this repo owns and pins (`tests/unit/accountDisabledContract.spec.ts`).
  if (status === 403) {
    return 'This account isn’t verified yet — use the verification link we emailed you, then sign in.'
  }
  return 'Invalid email or password.'
}

export function LoginForm() {
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
        // ⚑ 403 NO LONGER HAS ONE CAUSE. This branch used to read "the login op's ONLY 403 is
        // UnverifiedEmail (bad credentials and lockout are 401, the throttle 429)" and map every 403
        // to the verification message. That reasoning was correct while it held — and the
        // `signInDisabled` gate (D13a) broke it by adding a SECOND 403 to the same operation, which
        // would have sent a disabled user hunting for a verification email that does not exist.
        //
        // So: check the machine-readable code FIRST, then fall back to the old status rule. Still
        // never message text — the copy is i18n and shifts with Payload upgrades; `data.code` is a
        // contract this repo owns and pins (`tests/unit/accountDisabledContract.spec.ts`).
        setError(signInErrorMessage(await readErrorCode(res), res.status))
        return
      }
      // ONE document navigation, not `router.replace('/')` + `router.refresh()` — that pair rendered
      // the catalogue TWICE, and dropping just the `refresh()` would land a logged-out header.
      // `replace`, not `assign`: keeps Back off /login. See DECISIONS.md 2026-08-03.
      window.location.replace('/')
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
        <PasswordInput
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
      <button type="submit" className="btn btn--primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
