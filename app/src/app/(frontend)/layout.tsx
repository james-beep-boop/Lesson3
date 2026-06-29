import React from 'react'
import Link from 'next/link'

import { getSession } from '@/lib/session'
import { AppNav } from '@/components/AppNav'

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
        {/* Header only for signed-in users; the logged-out /login route is a clean splash that
            supplies its own branding. */}
        {user && (
          <header className="app-header">
            <Link href="/" className="brand">
              Lesson Plan Repository
            </Link>
            {/* The ONE shared nav (Lessons · [Manage] · Guide · avatar). The admin surface renders the
                same <AppNav> via admin.components.header, so the two match exactly. */}
            <AppNav user={user} />
          </header>
        )}
        <main className="app-main">{children}</main>
      </body>
    </html>
  )
}
