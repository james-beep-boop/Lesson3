import React from 'react'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — Lesson Plan Repository 3' }

export default async function LoginPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  return (
    <section className="login">
      <h1>Sign in</h1>
      <LoginForm />
    </section>
  )
}
