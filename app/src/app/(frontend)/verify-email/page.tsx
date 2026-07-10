import React from 'react'
import Link from 'next/link'

import { VerifyEmail } from './VerifyEmail'

export const metadata = { title: 'Verify email — Lesson Plan Repository' }

/** Landing page for the emailed verification link (?token=…). No redirect-if-signed-in: someone
 *  signed in on a shared machine can still verify a different, fresh account's link. */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = ((await searchParams).token ?? '').trim()
  return (
    <section className="login">
      <h1 className="login-title">Lesson Plan Repository</h1>
      <p className="login-subtitle">Verify your email</p>
      {token ? (
        <VerifyEmail token={token} />
      ) : (
        <p className="login-note">
          This page needs the link from your verification email. Check your inbox, or{' '}
          <Link href="/signup">create an account</Link>.
        </p>
      )}
    </section>
  )
}
