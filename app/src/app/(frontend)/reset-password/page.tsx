import React from 'react'
import Link from 'next/link'

import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata = { title: 'Reset password — Lesson Plan Repository' }

/** Landing page for the emailed reset link (?token=…). No redirect-if-signed-in: a signed-in
 *  user following a fresh reset link should still be able to complete it. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const token = ((await searchParams).token ?? '').trim()
  return (
    <section className="login">
      <h1 className="login-title">Lesson Plan Repository</h1>
      <p className="login-subtitle">Choose a new password</p>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="login-note">
          This page needs the link from your reset email. <Link href="/forgot-password">Request one</Link>.
        </p>
      )}
    </section>
  )
}
