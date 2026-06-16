import React from 'react'
import Link from 'next/link'

import { getSession } from '@/lib/session'
import { canUseAdminPanel } from '@/access'

import './styles.css'
import { LogoutButton } from './LogoutButton'

export const metadata = {
  title: 'Lesson Plan Repository 3',
  description: 'ARES Lesson Library',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSession()
  // Show the Admin link only to roles that can actually use /admin — the same rule that gates
  // the panel itself (§13: no dead/forbidden controls).
  const canAdmin = canUseAdminPanel(user)

  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <Link href="/" className="brand">
            Lesson Plan Repository&nbsp;3
          </Link>
          {user && (
            <nav className="app-nav">
              {canAdmin && (
                // Full navigation into the Payload admin (a separate app surface), not a
                // client-side route into The App — so a plain <a> is intentional here.
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a href="/admin" className="nav-link">
                  Admin
                </a>
              )}
              <span className="nav-user">{user.name ?? user.email}</span>
              <LogoutButton />
            </nav>
          )}
        </header>
        <main className="app-main">{children}</main>
      </body>
    </html>
  )
}
