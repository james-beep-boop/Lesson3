import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { isPublicLibraryEnabled } from '@/lib/publicLibrary'
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
      {/*
        Public discovery, when this deployment opts in. Deliberately SECONDARY and below the
        sign-in links: `/login` stays the restrained front door for the offline school
        installations too, and this must not grow into a marketing panel above the form.
        An offline/disabled deployment renders nothing here — and `/explore` 404s regardless,
        because the absent link is presentation, not the boundary (lib/publicLibrary.ts).
      */}
      {isPublicLibraryEnabled() && (
        <p className="login-explore">
          <Link href="/explore">Explore free lesson plans</Link>
        </p>
      )}
    </section>
  )
}
