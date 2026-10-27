import { schoolPageMetadata } from '@/lib/schoolMetadata'
import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { hasRegisteredUsers } from '@/lib/firstUserBootstrap'
import { SignupForm } from './SignupForm'

export const generateMetadata = () => schoolPageMetadata('Sign up — Lesson Plan Editor')

/** Open self-registration (2026-07-09): standard Payload create + login, new accounts are plain
 *  Teachers (privileged fields are create-gated server-side). On a site that cannot send email (no
 *  SMTP — typically an offline school server) a Site Administrator approves new accounts instead of
 *  an emailed link, and the form says so before and after signing up (2026-10-19). */
export default async function SignupPage() {
  const { payload, user } = await getSession()
  if (user) redirect('/')
  if (!(await hasRegisteredUsers(payload))) redirect('/login')
  // Same test as Forgot password and the lesson page's email actions.
  const emailEnabled = !!process.env.SMTP_HOST?.trim()
  return (
    <section className="login">
      <h1 className="login-title">Lesson Plan Editor</h1>
      <p className="login-subtitle">Create an account</p>
      <SignupForm emailEnabled={emailEnabled} />
      <p className="login-links">
        <Link href="/login">Already have an account? Sign in</Link>
      </p>
    </section>
  )
}
