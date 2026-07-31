import React from 'react'
import { redirect } from 'next/navigation'

import PageBackLink from '@/components/PageBackLink'
import { getSession } from '@/lib/session'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata = { title: 'Forgot password — ARES Lesson Plans' }

export default async function ForgotPasswordPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  return (
    <section className="login">
      <div className="login-back">
        <PageBackLink href="/login" label="Back to sign in" />
      </div>
      <h1 className="login-title">ARES Lesson Plans</h1>
      <p className="login-subtitle">Reset your password</p>
      <ForgotPasswordForm />
    </section>
  )
}
