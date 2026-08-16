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

import { json, readJsonBody } from './respond'
import type { User } from '../payload-types'

/**
 * Raw-body ceiling for this endpoint.
 *
 * ⚑ The 500-id cap below bounds what is USED, not what is READ. Without this, `req.json()` buffers
 * whatever arrives before `parseIds` sees a single element — and Next's App Router route handlers
 * impose no default body limit (the 4 MB default is Pages API routes and Server Actions;
 * `experimental.serverActions.bodySizeLimit` does not reach REST routes, and `src/middleware.ts`
 * only sets CSP).
 *
 * 64 KiB against a legitimate worst case of ~4 KB (500 ids at 8 characters each, plus framing) —
 * generous enough that no honest client is ever refused, small enough that a dishonest one is. This
 * is why the constant is still local: it is sized against THIS endpoint's list, not against the
 * scalar `MAX_CONTROL_BODY_BYTES` shape its siblings use.
 */
export const MAX_MARK_READ_BODY_BYTES = 64 * 1024

/**
 * Coerce an untrusted body value to a bounded list of positive integer ids (dedup, cap 500).
 *
 * Exported for `tests/unit/markReadBody.spec.ts`, so the coercion rules can be asserted directly
 * rather than through a fake request that has nothing to do with them.
 */
export function parseIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set<number>()
  for (const v of raw) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) ids.add(n)
    if (ids.size >= 500) break // matches the inbox page limit with headroom; bounds the IN list
  }
  return [...ids]
}

/**
 * Guard the declared body size, then read the ids out of it.
 *
 * Split out and exported ONLY so the ceiling is unit-testable without a database or a served app —
 * the same split, for the same reason, as `recoveryParse.ts` and `previewParse.ts`. The assertion
 * that matters is that an oversized body is refused WITHOUT `req.json()` being called, since a 413
 * returned after the body had already materialised would have cost exactly the memory the guard
 * exists to refuse.
 */
export async function readMarkReadIds(req: PayloadRequest): Promise<number[]> {
  const body = await readJsonBody<{ ids?: unknown }>(req, MAX_MARK_READ_BODY_BYTES)
  return parseIds(body?.ids)
}

export const markMessagesReadEndpoint: Endpoint = {
  path: '/mark-read',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const ids = await readMarkReadIds(req)
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
