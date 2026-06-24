import React from 'react'
import Link from 'next/link'

import { getSession } from '@/lib/session'
import { canUseAdminPanel } from '@/access'
import { Avatar } from '@/components/Avatar'
import { LogoutButton } from '@/components/LogoutButton'

import './styles.css'

export const metadata = {
  title: 'Lesson Plan Repository',
  description: 'ARES Lesson Library',
}

// The App is authenticated and per-request (Payload auth + live data) — never statically
// prerendered. Set at the route-group root so it applies to every page below. Without this,
// `next build` tries to prerender and hits the DB at build time (no DB → build fails).
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSession()

  return (
    <html lang="en">
      <body>
        {/* Header (with the user menu) only for signed-in users; the logged-out /login route is a
            clean splash that supplies its own branding. The full top-right menu (avatar + dynamic
            Admin/Lessons cross-link) lands in the next installment. */}
        {user && (
          <header className="app-header">
            <Link href="/" className="brand">
              Lesson Plan Repository
            </Link>
            {/* The shared user menu: username · [Admin] · logout · avatar (the admin surface has the
                same menu, top-right, via admin.components.header). */}
            <nav className="app-nav">
              <span className="nav-user">{user.name ?? user.email}</span>
              {/* "Admin" only for roles that can use /admin (§13). The other surface's menu shows
                  "Lessons" instead — each links to the surface you're NOT on. A plain <a> is a full
                  navigation into the separate admin app. */}
              {canUseAdminPanel(user) && (
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a href="/admin" className="nav-link">
                  Admin
                </a>
              )}
              <LogoutButton />
              <Avatar name={user.name ?? user.email} />
            </nav>
          </header>
        )}
        <main className="app-main">{children}</main>
      </body>
    </html>
  )
}
