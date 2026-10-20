import { RELEASE_FINGERPRINT_CONTEXT } from '../fields/identity'
import { releaseFingerprint } from '../lib/identity/releaseFingerprint'

type ContextCarrier = { context?: unknown }

/**
 * Run ONE create with an ARES release's `ares-content-v1` fingerprint available to the field hook
 * (2026-10-19). `req.context` is the only channel the hook accepts.
 *
 * ⚑ CLEAR THE LIVE CONTEXT, NOT THE OBJECT YOU SET IT ON (#416 review). Payload's `createLocalReq`
 * does not merely merge into `req.context` — it REPLACES it with a new object built from the old one
 * (`utilities/createLocalReq.js`, `getRequestContext`). So a reference captured before `create()` is
 * stale afterwards, and deleting the key from it left the fingerprint on the live request for any
 * later create sharing that request to inherit. `finally` therefore deletes from whatever object
 * `req.context` IS by then, on success and failure alike.
 */
export async function withReleaseFingerprint<T>(
  req: ContextCarrier,
  bundle: unknown,
  create: () => Promise<T>,
): Promise<T> {
  const before = (req.context ?? {}) as Record<string, unknown>
  req.context = {
    ...before,
    [RELEASE_FINGERPRINT_CONTEXT]: releaseFingerprint(bundle as Record<string, unknown>),
  }
  try {
    return await create()
  } finally {
    const live = req.context as Record<string, unknown> | undefined
    if (live && typeof live === 'object') delete live[RELEASE_FINGERPRINT_CONTEXT]
  }
}
