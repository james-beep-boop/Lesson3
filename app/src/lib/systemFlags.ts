/**
 * The enforcement reader for the `system-settings` flags (`globals/SystemSettings.ts`).
 *
 * ⚑ FAIL CLOSED, AND SAY SO. A failed read — a database fault, a missing row, a missing or non-boolean
 * value — means OFF, and a failure is logged as a structured error, so an operator can tell a fault from
 * a deliberate off (`docs/DESIGN-system-panel-2026-08-21.md`, "Reads"). Only an explicit stored `true`
 * turns a capability on. The stored DEFAULT is a different question: `forumEnabled` defaults to `true`,
 * and its migration inserts the singleton row so that a correct database never reads as "absent".
 *
 * ⚑ `overrideAccess: true`, deliberately and only here. The global's own `read` is Site-Admin-only,
 * but enforcement has to resolve a flag for every caller — a Teacher opening the forum, a request with
 * no user at all. This module is server-only and returns booleans, never the document.
 *
 * ⚑ NEVER CACHED ACROSS REQUESTS. The forum's switch-off contract — a request that starts after the
 * switch is turned off is refused — holds only because every request reads the flag afresh
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.4, "Timing contract"). `isForumEnabled` memoises on
 * `req.context`, which lives for exactly one request. Adding a cross-request cache weakens that
 * contract to "within the TTL", and needs a recorded decision first.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { SystemFlag } from '../globals/SystemSettings'

export type SystemFlags = Readonly<Record<SystemFlag, boolean>>

/** Every flag off — what a failed read resolves to. */
const ALL_OFF: SystemFlags = { publicLibraryLive: false, forumEnabled: false }

/** Read every flag once. Never throws: a failure is logged and resolves to {@link ALL_OFF}. */
export async function readSystemFlags(payload: Payload): Promise<SystemFlags> {
  try {
    const doc = await payload.findGlobal({
      slug: 'system-settings',
      depth: 0,
      overrideAccess: true,
    })
    const features = (doc as { features?: Partial<Record<SystemFlag, unknown>> | null }).features
    return {
      // `=== true`: null, undefined and anything a corrupted column could hold all read as off.
      publicLibraryLive: features?.publicLibraryLive === true,
      forumEnabled: features?.forumEnabled === true,
    }
  } catch (err) {
    payload.logger.error(
      { err, event: 'system_settings_read_failed' },
      'system settings could not be read — every capability flag fails closed (off)',
    )
    return ALL_OFF
  }
}

const MEMO_KEY = 'lesson3:systemFlags'

/**
 * Is the Discuss forum switched on, for THIS request? One read per request, shared by every access
 * check and hook that asks during it (they all carry the same `req.context`).
 *
 * The memo holds the PROMISE, so concurrent callers within one request share a single read rather than
 * racing to issue several.
 */
export async function isForumEnabled(req: PayloadRequest): Promise<boolean> {
  const context = req.context as Record<string, unknown>
  let pending = context[MEMO_KEY] as Promise<SystemFlags> | undefined
  if (!pending) {
    pending = readSystemFlags(req.payload)
    context[MEMO_KEY] = pending
  }
  return (await pending).forumEnabled
}
