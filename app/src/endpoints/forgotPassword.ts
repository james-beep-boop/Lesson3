/**
 * POST /api/users/forgot-password — Payload's native forgot-password, wrapped so that its response
 * is INDISTINGUISHABLE for a registered and an unknown address (audit 2026-07-20, L3-R1).
 *
 * THE ORACLE THIS CLOSES. The native operation sends inline and unguarded:
 *
 *   unknown address -> `if (!user) { commitTransaction(); return null }`  — returns EARLY,
 *                      no send attempted                                            => 200
 *   real account    -> `await email.sendEmail(...)` — unguarded, throws on SMTP failure => non-2xx
 *
 * A non-2xx therefore occurred ONLY for addresses that exist. During any SMTP outage the status code
 * enumerated registered users, on an UNAUTHENTICATED endpoint. This is not fixable in the client —
 * #119 tried and was reverted (#122) — because a direct API caller sees the difference without ever
 * loading our form. The fix has to be here.
 *
 * HOW: run the operation with `disableEmail: true`, so it never sends and therefore never throws for
 * SMTP reasons, then hand delivery to the retrying `passwordResetEmail` job. Both branches now return
 * the same 200 and the same body. Delivery moving off the request path also makes the user-facing
 * "a reset link is on its way" TRUE rather than merely uniform.
 *
 * WHY SHADOWING IS SAFE HERE: Payload matches a collection's CUSTOM endpoints before its built-in
 * auth endpoints (sanitize.js pushes auth endpoints AFTER `sanitized.endpoints`; handleEndpoints
 * takes the first match) — the same mechanism `endpoints/verifyEmail.ts` relies on. Unlike verify,
 * the forgot-password OPERATION does run collection `beforeOperation` hooks
 * (`buildBeforeOperation(... operation: 'forgotPassword')` in the installed source), so the existing
 * `rateLimitAuthOperations` throttle still fires through this path — it is NOT re-applied here, and
 * the http 429 test is the wire-level proof that it still bites.
 */
import { APIError, forgotPasswordOperation, type Endpoint } from 'payload'

import { json } from './respond'
import { PASSWORD_RESET_EMAIL_SLUG } from '../jobs/passwordResetEmail'

/** One body for every outcome. Must never vary on whether the account exists. */
const UNIFORM_MESSAGE = 'If an account exists for that address, a reset link is on its way.'

export const forgotPasswordQueuedEndpoint: Endpoint = {
  path: '/forgot-password',
  method: 'post',
  handler: async (req) => {
    const body = (await req.json?.()) as { email?: unknown } | undefined
    const email = typeof body?.email === 'string' ? body.email : ''
    // A MISSING field is a malformed request, not an account signal — the native operation 400s on
    // this too, identically for everyone, so mirroring it leaks nothing.
    if (!email) throw new APIError('Missing email.', 400)

    // `disableEmail: true` => the operation never calls sendEmail, so the ONE branch that could
    // throw differently for a real account is gone. Returns the token for a real account, null for
    // an unknown one. Collection `beforeOperation` hooks (the auth rate limit) still run inside.
    const token = await forgotPasswordOperation({
      collection: req.payload.collections.users,
      // `as never`: the installed arg type demands `password` (it reuses a login-shaped data type),
      // but the operation only ever reads `email`/`username` — passing a password would be
      // meaningless here. Same cast idiom the ingest path uses for Payload data args.
      data: { email } as never,
      disableEmail: true,
      req,
    })

    if (token) {
      try {
        // Look the user up to enqueue by id — the job deliberately never carries the token itself
        // (completed jobs are retained; see jobs/passwordResetEmail.ts).
        const { docs } = await req.payload.find({
          collection: 'users',
          where: { email: { equals: email } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const userId = docs[0]?.id
        if (userId != null) {
          await req.payload.jobs.queue({
            task: PASSWORD_RESET_EMAIL_SLUG,
            input: { userId: Number(userId) },
          })
        }
      } catch (err) {
        // DELIBERATE SWALLOW, and the one place in this codebase where it is the correct call.
        // Letting this propagate would return non-2xx for a REAL account only — re-creating exactly
        // the oracle this endpoint exists to close. The security property dominates: log loudly for
        // the operator, answer uniformly for the caller. (Contrast L3-03, where swallowing hid a
        // failed PRIMARY write; here the primary write — the reset token — has already committed
        // inside the operation above, and only delivery is affected.)
        req.payload.logger.error(
          { err },
          'forgot-password: reset token issued but the delivery job could not be queued',
        )
      }
    }

    // Identical status and body for BOTH branches. Do not add a condition to this line.
    return json({ message: UNIFORM_MESSAGE })
  },
}
