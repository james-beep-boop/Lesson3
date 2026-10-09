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
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.4, "Timing contract"). `systemFlagsFor` memoises on
 * `req.context`, which lives for exactly one request. Adding a cross-request cache weakens that
 * contract to "within the TTL", and needs a recorded decision first.
 */
import type { Payload, PayloadRequest } from 'payload'

import { SYSTEM_FLAGS, type SystemFlag } from './systemFlagNames'

export type SystemFlags = Readonly<Record<SystemFlag, boolean>>

/** Every flag from a stored `features` group — `=== true` only, so null, undefined, a missing group and
 *  anything a corrupted column could hold all read as off. Derived from `SYSTEM_FLAGS`, so a new flag
 *  needs no edit here. */
const flagsFrom = (
  features: Partial<Record<SystemFlag, unknown>> | null | undefined,
): SystemFlags =>
  Object.fromEntries(SYSTEM_FLAGS.map((flag) => [flag, features?.[flag] === true])) as SystemFlags

/**
 * Read every flag once. Never throws: unreadable settings fail closed; malformed flags are logged
 * and individually resolve to off, preserving the other valid stored values.
 *
 * Pass `req` when there is one: the read then runs on that request's connection (and its transaction,
 * if a write hook is asking) rather than holding a second pool connection beside it. A read that fails
 * inside an aborted transaction throws, and is caught below like any other failure — off.
 *
 * `select: { features: true }`, so the hot path does not fetch the provenance rows it never uses.
 */
export async function readSystemFlags(
  payload: Payload,
  req?: PayloadRequest,
): Promise<SystemFlags> {
  try {
    const doc = await payload.findGlobal({
      slug: 'system-settings',
      depth: 0,
      overrideAccess: true,
      select: { features: true },
      ...(req ? { req } : {}),
    })
    const features = (doc as { features?: Partial<Record<SystemFlag, unknown>> | null }).features
    const invalidFlags = SYSTEM_FLAGS.filter((flag) => typeof features?.[flag] !== 'boolean')
    if (invalidFlags.length) {
      payload.logger.error(
        { event: 'system_settings_invalid_flags', flags: invalidFlags },
        'system settings contain missing or invalid flags — those capabilities fail closed (off)',
      )
    }
    return flagsFrom(features)
  } catch (err) {
    payload.logger.error(
      { err, event: 'system_settings_read_failed' },
      'system settings could not be read — every capability flag fails closed (off)',
    )
    return flagsFrom(null)
  }
}

const MEMO_KEY = 'lesson3:systemFlags'

/**
 * Every flag, for THIS request: one read, shared by every access check and hook that asks during it
 * (they all carry the same `req.context`). The memo holds the PROMISE, so concurrent callers within one
 * request share a single read rather than racing to issue several.
 *
 * Server components have no `PayloadRequest`; their equivalent is a React `cache()` around
 * {@link readSystemFlags}, which is per-render and so keeps the never-across-requests rule. It arrives
 * with the first page that needs it.
 */
export function systemFlagsFor(req: PayloadRequest): Promise<SystemFlags> {
  const context = req.context as Record<string, unknown>
  context[MEMO_KEY] ??= readSystemFlags(req.payload, req)
  return context[MEMO_KEY] as Promise<SystemFlags>
}

/** Is the Discuss forum switched on, for this request? */
export const isForumEnabled = async (req: PayloadRequest): Promise<boolean> =>
  (await systemFlagsFor(req)).forumEnabled
