/**
 * GET /api/server-time — the server's clock, for the Manage page's wrong-clock warning (2026-10-19).
 *
 * An offline school server cannot set its own time, and after a power cut with a flat clock battery
 * it can come back years off — breaking draft expiry, dates and sign-in timeouts. The administrator's
 * phone or laptop usually has the right time, so the warning compares the two. It asks for the time
 * FRESH when it appears, rather than reading a timestamp baked into the page: a Back navigation can
 * restore Manage from Next.js's client cache with a server time hours old (#416 follow-up review).
 *
 * Site-Admin-only, like the System panel it belongs to. `no-store`: a cached answer is a wrong answer.
 */
import type { Endpoint, PayloadRequest } from 'payload'

import { assertSiteAdmin } from './respond'

export const serverTimeEndpoint: Endpoint = {
  path: '/server-time',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    assertSiteAdmin(req)
    return Response.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
  },
}
