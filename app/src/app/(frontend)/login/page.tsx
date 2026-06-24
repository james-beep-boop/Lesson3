import React from 'react'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — Lesson Plan Repository' }

export default async function LoginPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  return (
    <section className="login">
      <h1 className="login-title">Lesson Plan Repository</h1>
      <p className="login-subtitle">Sign in</p>
      <LoginForm />
    </section>
  )
}
