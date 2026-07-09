import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata = { title: 'Forgot password — Lesson Plan Repository' }

export default async function ForgotPasswordPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  return (
    <section className="login">
      <h1 className="login-title">Lesson Plan Repository</h1>
      <p className="login-subtitle">Reset your password</p>
      <ForgotPasswordForm />
      <p className="login-links">
        <Link href="/login">Back to sign in</Link>
      </p>
    </section>
  )
}
