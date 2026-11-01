/**
 * POST /api/users/redeem-reset-code — `{ email, code }` → `{ token }` for `/reset-password`.
 *
 * The laptop half of hand-delivered password reset (operator decision 2026-11-01; `lib/resetCode.ts`
 * says why a code exists and where its strength comes from). An administrator's `reveal-reset-link`
 * mints the reset token AND a short code; this endpoint trades a correct email + code for that same
 * token, so the person finishes in the ordinary reset page. Nothing here sets a password, signs
 * anyone in, or mints a token — it can only hand back one an administrator already issued.
 *
 * ⚑ UNAUTHENTICATED, SO EVERY FAILURE LOOKS THE SAME. Unknown address, no code issued, wrong code,
 * expired code, too many tries, a disabled account, a token already used: one status, one body, and
 * the same minimum response time (`padToFloor`, as `forgotPassword.ts` does and for the same reason —
 * the branches do different amounts of database work). Otherwise the endpoint would tell anyone on
 * the school network which addresses have accounts.
 *
 * ⚑ THE ATTEMPT IS CHARGED BEFORE THE CODE IS COMPARED, in one atomic UPDATE that also refuses an
 * exhausted or expired code. Read-then-increment would let concurrent guesses all read the same
 * count and each get a free try. The success write is conditional on the hash it read, so two
 * correct redemptions racing cannot both win.
 *
 * Rate limit: per client address (`loginClient`), which bounds load. The attempt cap is the real
 * guard against guessing and does not depend on where requests come from.
 */
import { sql } from '@payloadcms/db-postgres'
import { APIError, type Endpoint } from 'payload'

import { positiveIntEnv } from '../lib/env'
import { loginClient } from '../lib/loginProtection'
import { consumeRateLimit } from '../lib/rateLimit'
import { normalizeResetCode, RESET_CODE_MAX_ATTEMPTS, resetCodeMatches } from '../lib/resetCode'
import { poolDb } from '../lib/txDb'
import { json, MAX_CONTROL_BODY_BYTES, readJsonBody } from './respond'

export const RESET_CODE_FAILURE =
  'That email and code do not match a current reset code. Codes last 15 minutes and stop ' +
  'working after 5 wrong tries — ask your Site administrator for a new one.'

const RESPONSE_FLOOR_MS = positiveIntEnv('RESET_CODE_RESPONSE_FLOOR_MS', 400)
const NO_STORE = { 'Cache-Control': 'no-store' }

const padToFloor = async (startedAt: number): Promise<void> => {
  const remaining = RESPONSE_FLOOR_MS - (Date.now() - startedAt)
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
}

type Exec = { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> }

export const redeemResetCodeEndpoint: Endpoint = {
  path: '/redeem-reset-code',
  method: 'post',
  handler: async (req) => {
    const startedAt = Date.now()
    const body = await readJsonBody<{ email?: unknown; code?: unknown }>(
      req,
      MAX_CONTROL_BODY_BYTES,
      'Request body too large.',
    )
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const typed = typeof body?.code === 'string' ? body.code : ''
    // Missing fields are a malformed request, identical for everyone — no account signal.
    if (!email || !typed) throw new APIError('Enter your email and the code.', 400)

    // Charged before any lookup, so probing is never free. Like the 400 above, a 429 describes the
    // requester, not the account, so it is not padded.
    const budget = await consumeRateLimit(req, 'resetCodeClient', loginClient(req, email))
    if (!budget.ok) {
      return json(
        { errors: [{ message: `Too many tries — please wait ${budget.retryAfterSec}s.` }] },
        429,
        { 'Retry-After': String(budget.retryAfterSec), ...NO_STORE },
      )
    }

    const token = await redeem(req, email, typed)
    await padToFloor(startedAt)
    return token
      ? json({ token }, 200, NO_STORE)
      : json({ errors: [{ message: RESET_CODE_FAILURE }] }, 400, NO_STORE)
  },
}

async function redeem(
  req: Parameters<Endpoint['handler']>[0],
  email: string,
  typed: string,
): Promise<string | null> {
  const db = poolDb(req.payload) as Exec
  // Charge one attempt to a live, unexhausted code for this address, and read what is needed to
  // judge it. No row: no such account, no code, expired, or out of tries — all the same answer.
  const charged = await db.execute(sql`
    UPDATE "users"
       SET "reset_code_attempts" = COALESCE("reset_code_attempts", 0) + 1
     WHERE lower("email") = ${email}
       AND "reset_code_hash" IS NOT NULL
       AND "reset_code_expires_at" > now()
       AND COALESCE("reset_code_attempts", 0) < ${RESET_CODE_MAX_ATTEMPTS}
    RETURNING "id", "reset_code_hash", "reset_password_token", "reset_password_expiration",
              "sign_in_disabled";`)
  const row = charged.rows[0]
  if (!row) return null

  const normalized = normalizeResetCode(typed)
  const id = Number(row.id)
  const stored = String(row.reset_code_hash)
  if (!normalized || !resetCodeMatches(req.payload.secret, id, normalized, stored)) return null

  // A correct code still opens nothing the reset page would refuse: the token must be live, and a
  // disabled account cannot complete a reset (its `beforeLogin` runs inside resetPassword).
  const tokenValue = typeof row.reset_password_token === 'string' ? row.reset_password_token : ''
  const tokenExpiry = Date.parse(String(row.reset_password_expiration))
  if (!tokenValue || !(tokenExpiry > Date.now()) || row.sign_in_disabled === true) return null

  // Single use: clear the code, conditional on the hash we judged, so a racing second redemption of
  // the same code finds nothing to clear and fails.
  const cleared = await db.execute(sql`
    UPDATE "users"
       SET "reset_code_hash" = NULL, "reset_code_expires_at" = NULL, "reset_code_attempts" = 0
     WHERE "id" = ${id} AND "reset_code_hash" = ${stored}
    RETURNING "id";`)
  return cleared.rows.length === 1 ? tokenValue : null
}
