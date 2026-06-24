import React from 'react'
import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'
import { isSafeRedirect } from '@/lib/safeRedirect'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — Lesson Plan Repository' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { user } = await getSession()
  // Where to land after auth: the (sanitized) ?redirect= the middleware forwarded from
  // /admin/login, else The App home. Teachers without a redirect just land on /.
  const sp = await searchParams
  const target = isSafeRedirect(sp.redirect) ? sp.redirect : '/'
  if (user) redirect(target)
  return (
    <section className="login">
      <h1 className="login-title">Lesson Plan Repository</h1>
      <p className="login-subtitle">Sign in</p>
      <LoginForm redirectTo={target} />
    </section>
  )
}
