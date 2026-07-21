'use client'

/**
 * Standard Payload forgot-password (2026-07-09): POST /api/users/forgot-password emails a reset
 * link to the FRONTEND /reset-password page (Users.auth.forgotPassword.generateEmailHTML). The
 * response is deliberately the same whether or not the account exists (no existence oracle), and
 * the operation is rate-capped per address + globally (#42).
 *
 * ⚠️ THE CLIENT MUST NOT DISTINGUISH SERVER FAILURE FROM SUCCESS. A `!res.ok` branch was added on
 * 2026-07-20 (#119) and REVERTED the same day — it created an account-existence oracle. The
 * reasoning that justified it ("Payload returns 200 for an unknown address, so non-OK means server
 * failure, not existence") is half-true and the missing half is fatal:
 *
 *   installed `payload/dist/auth/operations/forgotPassword.js`
 *     - unknown address  -> `if (!user) { commitTransaction(); return null }`  — returns EARLY,
 *                           no email is ever attempted                          => HTTP 200
 *     - real account     -> falls through to an UNGUARDED `await email.sendEmail(...)`  => throws
 *                           on SMTP failure                                     => non-2xx
 *
 * So server failure only happens FOR ACCOUNTS THAT EXIST. During any SMTP outage the status code
 * discriminates registered addresses perfectly, on an unauthenticated endpoint. The per-address and
 * global rate caps bound the volume but do not remove the oracle.
 *
 * This restores the deliberate 2026-07-17 posture. The known cost is that a genuine send failure is
 * reported to the user as success. That cannot be fixed in the client at all: the fix must make the
 * SERVER's responses indistinguishable — queue the reset email through the existing jobs queue with
 * retry, so the response is always 200 and "a reset link is on its way" becomes TRUE rather than
 * merely uniform. Tracked as a follow-up; see DECISIONS 2026-07-20.
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
      // DO NOT add a `!res.ok` branch here. See the header — a non-OK status is perfectly
      // correlated with account existence during an SMTP outage, so surfacing it leaks who has an
      // account. 429 above is safe (it describes the REQUESTER, not the account) and the catch
      // below is safe (a client/network failure happens before any server-side branch).
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
