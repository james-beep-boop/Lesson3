import { NextResponse, type NextRequest } from 'next/server'

import { isSafeRedirect } from '@/lib/safeRedirect'

/**
 * One login form (SPEC §2). There is a single login UI — the frontend `/login`. Payload sends
 * unauthenticated `/admin/*` requests to `/admin/login?redirect=<original>`. We intercept that in
 * middleware — BEFORE Payload renders anything — and send the user to `/login`, preserving a SAFE
 * (internal-only) redirect so an admin who started at `/admin` lands back there after signing in.
 *
 * Middleware (not a Payload view override) is the robust mechanism: it runs ahead of the admin app,
 * so `/admin/login` can never render a second login form or 404.
 */
export function middleware(req: NextRequest): NextResponse {
  const requested = req.nextUrl.searchParams.get('redirect')
  const target = isSafeRedirect(requested) ? requested : '/admin'

  const dest = req.nextUrl.clone()
  dest.pathname = '/login'
  dest.search = ''
  dest.searchParams.set('redirect', target)
  return NextResponse.redirect(dest)
}

// Only the admin login route — leaves create-first-user, the dashboard, and all other routes alone.
export const config = {
  matcher: '/admin/login',
}
