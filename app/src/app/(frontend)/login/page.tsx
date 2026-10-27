import { schoolPageMetadata } from '@/lib/schoolMetadata'
import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { hasRegisteredUsers } from '@/lib/firstUserBootstrap'
import { isPublicLibraryEnabled } from '@/lib/publicLibrary'
import { FirstUserForm } from './FirstUserForm'
import { LoginForm } from './LoginForm'
import SchoolName from '@/components/SchoolName'
import { schoolNameForRender } from '@/lib/systemFlags'
import AppVersion from '@/components/AppVersion'

export const generateMetadata = () => schoolPageMetadata('Sign in — ARES Lesson Plans')

export default async function LoginPage() {
  const { payload, user } = await getSession()
  if (user) redirect('/')
  const [schoolName, initialized] = await Promise.all([
    schoolNameForRender(payload),
    hasRegisteredUsers(payload),
  ])
  // Same test as Sign up and Forgot password: without SMTP, accounts wait for administrator approval.
  const emailEnabled = !!process.env.SMTP_HOST?.trim()
  return (
    <section className="login">
      {schoolName ? (
        <>
          <SchoolName name={schoolName} heading />
          <p className="login-title">ARES Lesson Plans</p>
        </>
      ) : (
        <h1 className="login-title">ARES Lesson Plans</h1>
      )}
      <p className="login-subtitle login-tagline">Find, download and print lesson plans.</p>
      <p className="login-subtitle">
        By{' '}
        <a href="https://areseducation.org" target="_blank" rel="noopener noreferrer">
          ARES Education
        </a>{' '}
        and{' '}
        <a href="https://www.seavuria.org" target="_blank" rel="noopener noreferrer">
          Seavuria
        </a>
      </p>
      {/*
        ⚑ ONE BRANCH, NOT A GUARD PER ELEMENT. "The setup screen shows the setup form and nothing
        else" is structural here; written as a chain of `initialized &&` prefixes it was a convention
        someone had to remember, and the next element added below would have leaked onto the
        first-run screen silently.
      */}
      {initialized ? (
        <>
          <LoginForm emailEnabled={emailEnabled} />
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
        </>
      ) : (
        <FirstUserForm />
      )}
      <AppVersion />
    </section>
  )
}
