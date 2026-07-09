import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { SignupForm } from './SignupForm'

export const metadata = { title: 'Sign up — Lesson Plan Repository' }

/** Open self-registration (2026-07-09): standard Payload create + login, new accounts are plain
 *  Teachers (privileged fields are create-gated server-side). */
export default async function SignupPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  return (
    <section className="login">
      <h1 className="login-title">Lesson Plan Repository</h1>
      <p className="login-subtitle">Create an account</p>
      <SignupForm />
      <p className="login-links">
        <Link href="/login">Already have an account? Sign in</Link>
      </p>
    </section>
  )
}
