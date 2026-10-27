import { schoolPageMetadata } from '@/lib/schoolMetadata'
import React from 'react'
import { redirect } from 'next/navigation'

import PageBackLink from '@/components/PageBackLink'
import { getSession } from '@/lib/session'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const generateMetadata = () => schoolPageMetadata('Forgot password — Lesson Plan Editor')

export default async function ForgotPasswordPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  const smtpEnabled = !!process.env.SMTP_HOST?.trim()
  return (
    <section className="login">
      <div className="login-back">
        <PageBackLink href="/login" label="Back to sign in" />
      </div>
      <h1 className="login-title">Lesson Plan Editor</h1>
      <p className="login-subtitle">Reset your password</p>
      <ForgotPasswordForm smtpEnabled={smtpEnabled} />
    </section>
  )
}
