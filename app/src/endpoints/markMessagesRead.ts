/**
 * Mark-messages-read endpoint (SPEC §10; Codex audit 2026-07-05 #4).
 *
 *   POST /api/messages/mark-read   body: { ids: number[] }
 *
 * Replaces the former mark-read-during-GET-render write on `/messages`. Doing it on a GET left a
 * cross-site integrity edge (a foreign page could navigate a logged-in user's browser to the inbox
 * and clear their unread state) that a `Sec-Fetch-Site` heuristic only partly closed — header-less
 * browsers still wrote. A state-changing POST is CSRF-safe FOR EVERY browser by construction: the
 * auth cookie is `SameSite=Lax`, which is NOT sent on a cross-site POST, so a forged request arrives
 * unauthenticated → 401. No header sniffing.
 *
 * The inbox fires this on mount with the ids it just showed, preserving the "viewing is reading"
 * UX and the "only mark what was displayed" scoping (unshown unread beyond the page limit stay
 * unread). The write runs `overrideAccess` (the collection's `update` access is closed), but it is
 * hard-scoped to `recipient = the session user`, so a caller can only ever mark ITS OWN messages
 * read — foreign ids in the body match nothing.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { json } from './respond'
import type { User } from '../payload-types'

/** Coerce an untrusted body value to a bounded list of positive integer ids (dedup, cap 500). */
function parseIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set<number>()
  for (const v of raw) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) ids.add(n)
    if (ids.size >= 500) break // matches the inbox page limit with headroom; bounds the IN list
  }
  return [...ids]
}

export const markMessagesReadEndpoint: Endpoint = {
  path: '/mark-read',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const body = (typeof req.json === 'function' ? await req.json().catch(() => null) : null) as {
      ids?: unknown
    } | null
    const ids = parseIds(body?.ids)
    if (ids.length === 0) return json({ ok: true, updated: 0 })

    const userId = (req.user as User).id
    // Hard-scoped to the session user's own unread messages — foreign ids match nothing.
    const result = await req.payload.update({
      collection: 'messages',
      where: {
        and: [
          { recipient: { equals: userId } },
          { id: { in: ids } },
          { readAt: { exists: false } },
        ],
      },
      data: { readAt: new Date().toISOString() },
      overrideAccess: true,
      req,
    })
    return json({ ok: true, updated: result.docs.length })
  },
}
