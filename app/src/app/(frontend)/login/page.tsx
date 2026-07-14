import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — ARES Lesson Plans' }

export default async function LoginPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  return (
    <section className="login">
      <h1 className="login-title">ARES Lesson Plans</h1>
      <p className="login-subtitle">
        By{' '}
        <a href="https://areseducation.org" target="_blank" rel="noopener noreferrer">
          ARES Education
        </a>
      </p>
      <LoginForm />
      <p className="login-links">
        <Link href="/signup">Sign up</Link>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
    </section>
  )
}
