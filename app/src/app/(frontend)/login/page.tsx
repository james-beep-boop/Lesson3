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
import { systemSettingsForRender } from '@/lib/systemFlags'
import AppVersion from '@/components/AppVersion'

export const generateMetadata = () => schoolPageMetadata('Sign in — ARES Lesson Plans')

/**
 * The intro column: who the page belongs to and what the product is for. With a school name the name
 * is the page's h1, as it has been since the school-name work (SPEC §11); without one the
 * headline is. `children` is the forum invitation, which only the sign-in branch passes.
 */
function LoginIntro({
  schoolName,
  children,
}: {
  schoolName: string | null
  children?: React.ReactNode
}) {
  // The school name, when set, is the page's h1; otherwise the headline is.
  const Headline = schoolName ? 'p' : 'h1'
  return (
    <div className="login-intro">
      {schoolName ? (
        <SchoolName name={schoolName} heading />
      ) : (
        <p className="login-kicker">For your classroom</p>
      )}
      <Headline className="login-headline">
        Good lessons.
        <br />
        Ready to teach.
      </Headline>
      <p className="login-lead">Find, adapt, and download lesson plans for your classroom.</p>
      {children}
    </div>
  )
}

export default async function LoginPage() {
  const { payload, user } = await getSession()
  if (user) redirect('/')
  // One settings read carries both the school name and the forum flag (lib/systemFlags.ts); no
  // signed-out request has to be built for the flag, and nothing else from the row reaches the page.
  const [{ schoolName, flags }, initialized] = await Promise.all([
    systemSettingsForRender(payload),
    hasRegisteredUsers(payload),
  ])
  // Same test as Sign up and Forgot password: without SMTP, accounts wait for administrator approval.
  const emailEnabled = !!process.env.SMTP_HOST?.trim()
  return (
    <div className="login-page">
      {/*
        The signed-out brand strip lives HERE, not in the root layout: the layout's header is
        conditional on the session and auth transitions are full-document navigations (see the ⚑ in
        layout.tsx), so a signed-out header in the layout would change the shape it caches.
      */}
      <header className="app-header login-brandbar">
        <span className="brand">ARES Lesson Plans</span>
        <span className="login-brandbar__credit">ARES Education &amp; Seavuria</span>
      </header>
      {/*
        ⚑ ONE BRANCH, NOT A GUARD PER ELEMENT. "The setup screen shows the setup form and nothing
        else" is structural here; written as a chain of `initialized &&` prefixes it was a convention
        someone had to remember, and the next element added below would have leaked onto the
        first-run screen silently.
      */}
      {initialized ? (
        <div className="login-layout">
          <LoginIntro schoolName={schoolName}>
            {/* Only when the forum is on: an invitation to something switched off is a dead end. */}
            {flags.forumEnabled && (
              <p className="login-note-together">
                <strong>Better together.</strong>
                Discuss your lesson plans with other teachers. Share ideas, ask questions, and learn
                from one another in the discussion forum.
              </p>
            )}
          </LoginIntro>
          <section className="login-panel" aria-labelledby="login-panel-title">
            <h2 id="login-panel-title">Sign in</h2>
            <p className="login-panel__welcome">Welcome to your lesson library.</p>
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
          </section>
        </div>
      ) : (
        <div className="login-layout">
          <LoginIntro schoolName={schoolName} />
          <section className="login-panel" aria-labelledby="login-panel-title">
            <h2 id="login-panel-title">First-time setup</h2>
            <FirstUserForm />
          </section>
        </div>
      )}
      <footer className="login-footer">
        <p>
          By{' '}
          <a href="https://areseducation.org" target="_blank" rel="noopener noreferrer">
            ARES Education
          </a>{' '}
          and{' '}
          <a href="https://www.seavuria.org" target="_blank" rel="noopener noreferrer">
            Seavuria
          </a>
        </p>
        <AppVersion />
      </footer>
    </div>
  )
}
