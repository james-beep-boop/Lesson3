'use client'

/**
 * Standard Payload email verification (2026-07-09): POST /api/users/verify/{token} on mount, show
 * the outcome. The token is single-use — Payload nulls it on success — so a re-visit of the link
 * lands in the failure branch, whose copy points at signing in first (the account may well
 * already be verified).
 */
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export function VerifyEmail({ token }: { token: string }) {
  const [state, setState] = useState<'pending' | 'verified' | 'failed'>('pending')
  // Guard the mutation against React strict-mode's dev double-effect: the second POST would spend
  // the single-use token's failure path and overwrite a real success with an error.
  const requested = useRef(false)

  useEffect(() => {
    if (requested.current) return
    requested.current = true
    fetch(`/api/users/verify/${encodeURIComponent(token)}`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => setState(res.ok ? 'verified' : 'failed'))
      .catch(() => setState('failed'))
  }, [token])

  if (state === 'pending') return <p className="login-note">Verifying…</p>
  if (state === 'verified') {
    return (
      <p className="login-note">
        Your email is verified — you can now <Link href="/login">sign in</Link>.
      </p>
    )
  }
  return (
    <p className="login-note">
      This verification link is invalid or was already used. Try{' '}
      <Link href="/login">signing in</Link> — if that says your account isn&apos;t verified, contact
      a site administrator.
    </p>
  )
}
