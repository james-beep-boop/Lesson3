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
import { enqueueDetached } from '../lib/enqueue'
import { positiveIntEnv } from '../lib/env'
import { PASSWORD_RESET_EMAIL_SLUG } from '../jobs/passwordResetEmail'

/** One body for every outcome. Must never vary on whether the account exists. */
const UNIFORM_MESSAGE = 'If an account exists for that address, a reset link is on its way.'

/**
 * Uniform-response-time floor. Every answer from this endpoint takes at least this long, so the
 * work a real account triggers cannot be read off the clock (see the note at the return statement).
 *
 * 400 ms is ~3x the slowest response measured on the Rock (140 ms) — headroom for a loaded host,
 * while staying well inside what feels instant for a once-in-a-while recovery action. Overridable
 * so an operator can re-tune after measuring their own hardware rather than editing code.
 */
const RESPONSE_FLOOR_MS = positiveIntEnv('FORGOT_PASSWORD_RESPONSE_FLOOR_MS', 400)

const padToFloor = async (startedAt: number): Promise<void> => {
  const remaining = RESPONSE_FLOOR_MS - (Date.now() - startedAt)
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
}

/*
 * THROWN paths (the 400 for a missing field, the 429 from the rate limiter) are deliberately NOT
 * padded: they answer fast. That is safe because neither depends on whether the account exists — the
 * limiter is keyed by the submitted address, so a sixth request about a nonexistent address is
 * throttled exactly like a sixth about a real one.
 *
 * It is, however, a very effective way to fool a MEASUREMENT, and it fooled the first verification
 * run of this fix: the probe had already spent the 5/day budget on the known accounts, so they
 * returned an unpadded 429 in ~18 ms while unknown addresses sat at the 409 ms floor — the gap
 * appeared to invert and widen. Clear `rate_limit_counters` for the `forgotPassword%` buckets before
 * timing this endpoint, or you will measure the throttle instead of the handler.
 */

export const forgotPasswordQueuedEndpoint: Endpoint = {
  path: '/forgot-password',
  method: 'post',
  handler: async (req) => {
    // Captured FIRST so the floor covers the whole handler, parsing included.
    const startedAt = Date.now()
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
        // Resolve the user BY THE TOKEN we just received, never by re-matching the email.
        //
        // This is a regression fix (2026-07-21). The first version looked the user up with
        // `email: { equals: email }` using the RAW request value, while the operation above finds the
        // account with a NORMALISED one — installed source, line 18:
        //   `(incomingArgs.data.email || '').toLowerCase().trim()`
        // So `Teacher@School.org` issued a live reset token and then matched nothing here: HTTP 200,
        // token minted, NO email queued — account recovery silently dead for anyone who capitalises
        // their address or leaves a trailing space. Every wire test passed because the fixtures are
        // all lowercase.
        //
        // Copying Payload's `.toLowerCase().trim()` would fix today's symptom but re-create the same
        // coupling: our normalisation would silently drift from theirs on any upstream change. The
        // token is the operation's own output and identifies exactly one row, so this cannot drift.
        // (`resetPasswordToken` is a hidden auth field — `overrideAccess` is what makes it queryable.)
        const { docs } = await req.payload.find({
          collection: 'users',
          where: { resetPasswordToken: { equals: token } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const userId = docs[0]?.id
        if (userId != null) {
          // Detached from any caller transaction, like every other best-effort enqueue (L3-03).
          await enqueueDetached(req.payload, {
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
    //
    // ...but identical BYTES are not enough: the two branches do very different amounts of database
    // work, and that was measurable. Measured on the Rock against real Postgres (2026-07-21, n=20
    // per branch): unknown accounts answered in a tight 23–29 ms, known accounts in 60–140 ms. The
    // distributions barely overlap, so ONE request classified an address — the daily cap of 5 per
    // target is no defence against a signal that only needs a single sample. That is the same
    // enumeration oracle L3-R1 closed, re-entering through the clock instead of the status code.
    //
    // So the handler also answers in uniform TIME, by padding every response out to a fixed floor
    // that sits above the slowest branch observed. Equalising the work itself was the alternative and
    // was rejected: the asymmetry starts inside `forgotPasswordOperation` (only a real account gets a
    // token UPDATE), so matching it would mean mirroring Payload's internals — the precise coupling
    // the token-lookup fix above exists to avoid.
    //
    // HONEST LIMIT: this narrows the channel rather than provably eliminating it. Under load heavy
    // enough to push the known-account branch past the floor, some signal returns. The floor is set
    // with ~3x headroom over the slowest measured response for that reason, and the rate limits
    // remain the backstop. Re-measure with `docs/OPS.md`'s timing probe if this endpoint changes.
    await padToFloor(startedAt)
    return json({ message: UNIFORM_MESSAGE })
  },
}
