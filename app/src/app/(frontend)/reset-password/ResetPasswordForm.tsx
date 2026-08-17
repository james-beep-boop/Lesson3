'use client'

/**
 * Standard Payload reset-password (2026-07-09): POST /api/users/reset-password with the emailed
 * token + the new password. On success Payload signs the user in (sets the auth cookie), so we
 * land straight on the library.
 */
import React, { useEffect, useState } from 'react'

import PasswordInput from '@/components/PasswordInput'
import { ACCOUNT_DISABLED_CODE, readErrorCode } from '@/errors/AccountDisabled'

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Scrub `?token=` from the address bar once this component holds it (D5a-iii).
   *
   * The token is a live credential travelling in a query string, so it lands in browser history and
   * in any proxy access log. **This does not fix the log exposure** — the request already happened —
   * and it is not claimed to: it removes the token from the history entry and from anything the user
   * later copies out of the address bar or shares over someone's shoulder. The server-side half is
   * already covered: `next.config.ts` sets `Referrer-Policy: strict-origin-when-cross-origin` on
   * every route, so the query is never forwarded off-site.
   *
   * `replaceState`, so Back does not return to a URL that still carries it. The token lives on in
   * React state — this is a URL change, not a state change, and submitting still works.
   *
   * ⚑ The proper fix for the log half is a URL fragment or a one-time handover code, which would
   * improve the emailed path too. That is its own work and deliberately not a gate on this feature,
   * which inherits the exposure rather than creating it.
   */
  useEffect(() => {
    if (!token) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('token')) return
    url.searchParams.delete('token')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [token])

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
        // ⚑ BOTH FAILURES HERE ARE 403, so status cannot separate them: Payload throws
        // `APIError('Token is either invalid or has expired.', FORBIDDEN)` for a bad token, and the
        // disabled-account gate throws its own 403 — `resetPassword` runs `beforeLogin` INLINE
        // before signing the token, so a disabled user's valid link fails and the password change
        // rolls back. Flattening both into "invalid or expired" told them their good link was broken.
        //
        // Branch on the code, never the status and never the message text (i18n).
        const code = await readErrorCode(res)
        setError(
          code === ACCOUNT_DISABLED_CODE
            ? 'This account is disabled — contact an administrator.'
            : 'This reset link is invalid or has expired — request a new one.',
        )
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
