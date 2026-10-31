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
        // No email here: an address box would do nothing (endpoints/forgotPassword.ts answers
        // without minting a token), so only say who can help. DECISIONS 2026-10-31.
        <p className="login-note">
          This site cannot send email, so it cannot send you a reset link. Ask your school&rsquo;s
          Site administrator: they can make a reset link for you in{' '}
          <strong>Manage &rarr; Users &rarr; Accounts</strong> and show it as a QR code to scan with
          your phone.
        </p>
      )}
    </section>
  )
}
