/**
 * Site-Admin user actions, mounted on `users` (D5, D13a):
 *
 *   - POST /:id/reveal-reset-link    — mint a reset token and return the link ONCE, for hand-delivery
 *   - POST /:id/set-site-admin       — grant or revoke the global Site Administrator role
 *   - POST /:id/set-sign-in-disabled — disable/enable sign-in, clearing live sessions atomically
 *
 * Body (JSON): `{ expectedUpdatedAt: string }`, plus `{ enabled: boolean }` for the two setters.
 *
 * SHAPE, and why it matches `userAssignments.ts` rather than inventing one: every write here is an
 * authorization change, so it takes the same freshness guard — `expectedUpdatedAt` is REQUIRED (400
 * absent), compared against the target's current `updatedAt` INSIDE the transaction after a row lock
 * (409 stale). Consent names the state it was about.
 *
 * ⚑ AUTHORIZE FIRST, THEN WRITE WITH `overrideAccess: true`. That pattern is only as safe as the
 * test proving the gate runs first, which is why CLAUDE.md requires wire-level 401/403/404/409
 * coverage in this same PR. The `overrideAccess` is not a convenience: `signInDisabled` and the base
 * `sessions` field both carry `update: () => false`, so a caller-scoped write CANNOT set them — that
 * is deliberate, and it is what makes this endpoint the single writer.
 *
 * ⚑ LOCK ORDER is fixed across this file and `hooks/userRoles.ts`: the global `ADMIN_COUNT_LOCK`
 * (taken inside `guardLastSiteAdmin`, during the update) is acquired AFTER this file's per-user
 * `lockRows`. Every path here takes the row lock first and the global lock second, so two requests
 * can never acquire the pair in opposite orders.
 */
import {
  APIError,
  commitTransaction,
  forgotPasswordOperation,
  initTransaction,
  killTransaction,
  type Endpoint,
  type PayloadRequest,
} from 'payload'

import { isSiteAdmin } from '../access'
import { ADMIN_RESET_LINK_CONTEXT } from '../hooks/authRateLimit'
import { emailLinkBase } from '../lib/emailLinkBase'
import { consumeRateLimit } from '../lib/rateLimit'
import { lockRows } from '../lib/txDb'
import type { User } from '../payload-types'
import { json, readJsonBody, MAX_CONTROL_BODY_BYTES } from './respond'

/**
 * Every response here is `no-store` (D5a-iii). The reset-link body carries a live credential, and
 * the two setters carry account status — neither belongs in a shared or browser cache.
 *
 * Applied to the whole file rather than just the reveal path so a future action cannot be added to
 * this file and quietly inherit default caching.
 */
const NO_STORE = { 'Cache-Control': 'no-store' } as const

/**
 * Shared body read + freshness value.
 *
 * ⚑ `readJsonBody` with an explicit ceiling, never a raw `req.json()`. The ceiling is a required
 * argument precisely so the guarded read is the shortest one to write, and
 * `tests/unit/jsonBodyCeiling.spec.ts` fails on any raw member `json()` in this directory.
 */
async function readActionBody(
  req: PayloadRequest,
): Promise<{ expectedUpdatedAt: string; enabled: boolean | undefined }> {
  const body = await readJsonBody<{ expectedUpdatedAt?: unknown; enabled?: unknown }>(
    req,
    MAX_CONTROL_BODY_BYTES,
  )
  const expectedUpdatedAt = body?.expectedUpdatedAt
  if (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new APIError('expectedUpdatedAt is required — reload before changing this account.', 400)
  }
  return {
    expectedUpdatedAt,
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
  }
}

/** Site-Admin gate + target id, shared by all three actions. 401 before 403 before 404. */
function requireSiteAdminCaller(req: PayloadRequest): number {
  if (!req.user) throw new APIError('Unauthorized', 401)
  if (!isSiteAdmin(req.user as User)) throw new APIError('Forbidden', 403)
  const targetId = Number(req.routeParams?.id)
  if (!Number.isFinite(targetId)) throw new APIError('Missing user id', 400)
  return targetId
}

/**
 * Load the target inside the transaction, after a row lock, and enforce the freshness check.
 *
 * Returns the fresh row so callers decide from post-lock state rather than the pre-lock read.
 */
async function lockAndVerifyFresh(
  req: PayloadRequest,
  targetId: number,
  expectedUpdatedAt: string,
): Promise<User> {
  await lockRows(req, 'users', [targetId])
  const target = (await req.payload.findByID({
    collection: 'users',
    id: targetId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as User
  if (Date.parse(String(target.updatedAt)) !== Date.parse(expectedUpdatedAt)) {
    throw new APIError(
      'This account changed since you loaded the page — reload before changing it.',
      409,
    )
  }
  return target
}

/**
 * POST /:id/reveal-reset-link — mint a password-reset token and return its link once (D5).
 *
 * ⚑ GRANTS NO NEW POWER, recorded explicitly so it is not later mistaken for privilege escalation:
 * a Site Admin can already set any password through `PATCH /api/users/:id`. This makes that existing
 * authority usable in a deployment with no reliable email, and is strictly BETTER than the
 * alternative — the administrator never learns the password, because the user sets it themselves
 * through the already-hardened reset flow.
 *
 * ⚑ NOT OFFERED FOR A DISABLED ACCOUNT. Consuming a reset link runs `beforeLogin` inline, so a
 * disabled user cannot complete it — minting a credential that cannot be used is a support call
 * waiting to happen. Re-enable first.
 */
const revealResetLinkEndpoint: Endpoint = {
  path: '/:id/reveal-reset-link',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const targetId = requireSiteAdminCaller(req)
    const { expectedUpdatedAt } = await readActionBody(req)

    // The admin-scoped toll, consumed BEFORE the carve-out flag is set — the ordering is what makes
    // this a carve-out rather than a bypass (see ADMIN_RESET_LINK_CONTEXT).
    const budget = await consumeRateLimit(req, 'adminResetLink', String((req.user as User).id))
    if (!budget.ok) {
      throw new APIError(
        `Too many reset links generated — please wait ${budget.retryAfterSec}s.`,
        429,
      )
    }

    const shouldCommit = await initTransaction(req)
    try {
      const target = await lockAndVerifyFresh(req, targetId, expectedUpdatedAt)
      if (target.signInDisabled) {
        throw new APIError(
          'This account’s sign-in is disabled — re-enable it before generating a reset link.',
          409,
        )
      }

      // Only NOW mark the operation as the admin path. Both preconditions have been met: the caller
      // is an authorized Site Admin, and the admin cap above was consumed.
      req.context = { ...(req.context ?? {}), [ADMIN_RESET_LINK_CONTEXT]: true }

      const token = await forgotPasswordOperation({
        collection: req.payload.collections.users,
        // Same `as never` idiom as `forgotPassword.ts`: the installed arg type demands a `password`
        // it never reads.
        data: { email: target.email } as never,
        disableEmail: true,
        req,
      })
      if (!token) {
        // Can't-happen: the target was just read by id inside this transaction. Fail loudly rather
        // than returning a link-shaped string with an empty token.
        throw new APIError('Could not generate a reset link for this account.', 500)
      }

      if (shouldCommit) await commitTransaction(req)

      // ⚑ THE TOKEN IS NEVER LOGGED. It is a live credential and the logger is a JSON stream, so
      // there is deliberately no `payload.logger` call on this path carrying `token`, `link`, or the
      // whole response object. `tests/int/…` asserts the log stream stays clean, because "we didn't
      // log it" is exactly the kind of claim that stops being true when someone adds a debug line.
      return json(
        {
          ok: true,
          link: `${emailLinkBase()}/reset-password?token=${token}`,
          // Stated so the panel can tell the administrator, rather than hard-coding an hour in the
          // UI: Payload's default is one hour and `Users.auth` sets no override (D5a-iv).
          expiresInMinutes: 60,
        },
        200,
        NO_STORE,
      )
    } catch (e) {
      await killTransaction(req)
      throw e
    }
  },
}

/**
 * The two boolean setters. They differ only in which field they write and what they clear, so they
 * share one handler rather than two near-copies that can drift.
 */
function booleanSetterEndpoint(kind: 'site-admin' | 'sign-in-disabled'): Endpoint {
  return {
    path: `/:id/set-${kind}`,
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      const targetId = requireSiteAdminCaller(req)
      const { expectedUpdatedAt, enabled } = await readActionBody(req)
      if (enabled === undefined) throw new APIError('enabled must be true or false.', 400)

      const shouldCommit = await initTransaction(req)
      try {
        const target = await lockAndVerifyFresh(req, targetId, expectedUpdatedAt)

        const data =
          kind === 'site-admin'
            ? {
                roles: enabled
                  ? [...new Set([...(target.roles ?? []), 'siteAdmin' as const])]
                  : (target.roles ?? []).filter((r) => r !== 'siteAdmin'),
              }
            : {
                signInDisabled: enabled,
                // ⚑ ATOMIC WITH THE FLAG, and this is the entire reason the endpoint exists rather
                // than a plain PATCH. `beforeLogin` stops NEW logins; it does nothing about a live
                // JWT, and `tokenExpiration` is 7200s. Payload's JWT strategy validates the token's
                // `sid` against this array (verified in auth/strategies/jwt.js), so emptying it
                // terminates every live session immediately. Setting the flag WITHOUT this produces
                // partial disablement — an account disabled on paper whose holder stays signed in
                // for up to two hours, while every UI reports success.
                //
                // Re-enabling deliberately does NOT restore sessions: there is nothing to restore,
                // and the user simply signs in again.
                ...(enabled ? { sessions: [] } : {}),
              }

        // `overrideAccess: true` because both fields are system-set (`update: () => false`) — the
        // caller was authorized above. Hooks STILL run, which is what applies the last-admin and
        // self-action guards to this trusted path.
        const updated = (await req.payload.update({
          collection: 'users',
          id: targetId,
          data: data as never,
          overrideAccess: true,
          user: req.user,
          req,
        })) as User

        if (shouldCommit) await commitTransaction(req)
        return json({ ok: true, updatedAt: updated.updatedAt }, 200, NO_STORE)
      } catch (e) {
        await killTransaction(req)
        throw e
      }
    },
  }
}

export const setSiteAdminEndpoint = booleanSetterEndpoint('site-admin')
export const setSignInDisabledEndpoint = booleanSetterEndpoint('sign-in-disabled')
export { revealResetLinkEndpoint }
