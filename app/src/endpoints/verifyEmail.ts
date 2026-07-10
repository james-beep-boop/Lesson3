/**
 * POST /api/users/verify/:id — Payload's native email-verification endpoint, wrapped with the
 * site-global rate cap (Codex 2026-07-10).
 *
 * WHY a custom endpoint: the native verify operation runs NO collection hooks (verified in
 * installed auth/operations/verifyEmail.js), so the `beforeOperation` seam that throttles
 * login/forgot-password/signup can't cover it — and unthrottled, every bogus token opens a
 * transaction and probes the users table. Payload matches a collection's CUSTOM endpoints before
 * its built-in auth endpoints (sanitize.js pushes auth endpoints AFTER `sanitized.endpoints`;
 * handleEndpoints takes the first match), so declaring the SAME path + method shadows the native
 * handler. The http 429 test is the wire-level proof the shadow actually applies — if a Payload
 * bump renames the built-in path, that test starts hitting the (unthrottled) native handler and
 * its 429 assertion fails.
 *
 * The verification itself stays Payload's own `verifyEmailOperation` (public export), so token
 * semantics never fork from upstream. Success/error shapes mirror the native handler:
 * 200 `{ message }` / thrown APIError (403 invalid token).
 */
import { verifyEmailOperation, type Endpoint } from 'payload'

import { json } from './respond'
import { enforceSharedRateLimit } from '../lib/rateLimit'

export const verifyEmailThrottledEndpoint: Endpoint = {
  path: '/verify/:id',
  method: 'post',
  handler: async (req) => {
    const over = await enforceSharedRateLimit(
      req,
      'verifyEmailGlobal',
      'all',
      'Too many verification attempts — please try again later.',
    )
    if (over) return over

    await verifyEmailOperation({
      collection: req.payload.collections.users,
      req,
      token: String(req.routeParams?.id ?? ''),
    })
    return json({ message: 'Account verified successfully.' })
  },
}
