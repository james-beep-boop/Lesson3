/**
 * Server-side session helpers for "The App" frontend (SPEC §2).
 *
 * Auth is Payload's: `payload.auth({ headers })` reads the request cookie and returns the
 * logged-in user (or null). Teachers authenticate here even though they're excluded from
 * `/admin`. Pages call `requireUser()` to gate access; data queries pass `{ user,
 * overrideAccess: false }` so the same access control as everywhere else applies.
 */
import { cache } from 'react'
import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

import type { User } from '@/payload-types'

// `cache` dedupes within a single request render: the layout and the page both resolve the
// session, but `payload.auth` (cookie verify + user lookup) then runs only once per request.
export const getSession = cache(
  async (): Promise<{ payload: Payload; user: User | null }> => {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: await nextHeaders() })
    return { payload, user: user as User | null }
  },
)

/** Like getSession, but redirects to /login when there's no authenticated user. */
export async function requireUser(): Promise<{ payload: Payload; user: User }> {
  const { payload, user } = await getSession()
  if (!user) redirect('/login')
  return { payload, user }
}
