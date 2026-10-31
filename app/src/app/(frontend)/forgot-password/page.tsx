import { schoolPageMetadata } from '@/lib/schoolMetadata'
import React from 'react'
import { redirect } from 'next/navigation'

import PageBackLink from '@/components/PageBackLink'
import { getSession } from '@/lib/session'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const generateMetadata = () => schoolPageMetadata('Forgot password — ARES Lesson Plans')

export default async function ForgotPasswordPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  const smtpEnabled = !!process.env.SMTP_HOST?.trim()
  return (
    <section className="login">
      <div className="login-back">
        <PageBackLink href="/login" label="Back to sign in" />
      </div>
      <h1 className="login-title">ARES Lesson Plans</h1>
      <p className="login-subtitle">Reset your password</p>
      {smtpEnabled ? (
        <ForgotPasswordForm />
      ) : (
        // No email at this installation (most school servers). An address box here would do
        // nothing — the endpoint deliberately answers uniformly without minting a token (see
        // endpoints/forgotPassword.ts) — so the page only says who can help. Operator decision
        // 2026-10-31: no unauthenticated "ask the administrator" request either; anyone on the
        // school network could send them.
        <p className="login-note" role="status">
          This site cannot send email, so it cannot send you a reset link. Ask your school&rsquo;s
          Site administrator: they can make a reset link for you in{' '}
          <strong>Manage &rarr; Users &rarr; Accounts</strong> and show it as a QR code to scan with
          your phone.
        </p>
      )}
    </section>
  )
}
