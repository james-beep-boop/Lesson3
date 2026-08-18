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
 * `sessions` field both carry `update: () => false`, so a caller-scoped write CANNOT set them.
 *
 * ⚑ "SOLE WRITER" IS TRUE OF `set-sign-in-disabled` ONLY, and the distinction matters. That field IS
 * closed to every other path, which is what forces the atomic flag+`sessions: []` pair through this
 * door. `set-site-admin` is different: `roles.update` is `siteAdminField`, so a Site Admin can still
 * change roles through a generic `PATCH /api/users/:id`. That endpoint adds the freshness guard and
 * the row lock, not exclusivity — the real invariant, `guardLastSiteAdmin`, is a collection hook and
 * therefore fires on the PATCH path too. Do not read this file as closing the generic route.
 *
 * ⚑ LOCK ORDER: `takeAdminCountLock` FIRST, then the per-user row lock inside `lockAndVerifyFresh`.
 * That order is not a preference — a generic `PATCH`/`DELETE` runs its hooks (which take the global
 * key) before Payload issues the DML that takes the row lock, so advisory-then-row is what every
 * other writer already does. An earlier version of this file did the opposite, which deadlocks a
 * same-user endpoint request against a concurrent PATCH. Pinned by `tests/unit/lockOrder.spec.ts`.
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

import { withAdminResetLinkAllowance } from '../hooks/authRateLimit'
import { takeAdminCountLock } from '../hooks/userRoles'
import { emailLinkBase } from '../lib/emailLinkBase'
import { consumeRateLimit } from '../lib/rateLimit'
import { lockAndVerifyFresh } from '../lib/txDb'
import type { User } from '../payload-types'
import {
  assertSiteAdmin,
  json,
  readJsonBody,
  requireExpectedUpdatedAt,
  MAX_CONTROL_BODY_BYTES,
} from './respond'

/**
 * Every response here is `no-store` (D5a-iii). The reset-link body carries a live credential, and
 * the two setters carry account status — neither belongs in a shared or browser cache.
 *
 * ⚑ Passed at each `json()` return, so it covers the SUCCESS bodies and the admin-cap 429. Thrown
 * refusals (400/409) are rendered by Payload's error handler and carry no such header — acceptable,
 * because none of those bodies contains a credential or account status, but it means the property is
 * per-return rather than structural. If a future action returns anything sensitive on an error path,
 * wrap the handlers instead of adding another hand-passed header.
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
): Promise<{ expectedUpdatedAt: string; enabled?: boolean }> {
  const body = await readJsonBody<{ expectedUpdatedAt?: unknown; enabled?: unknown }>(
    req,
    MAX_CONTROL_BODY_BYTES,
  )
  return {
    expectedUpdatedAt: requireExpectedUpdatedAt(
      body?.expectedUpdatedAt,
      'expectedUpdatedAt is required — reload before changing this account.',
    ),
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
  }
}

/**
 * The Site-Admin gate plus the target id, in that order.
 *
 * The gate itself is `assertSiteAdmin` from `respond.ts` — this is the third endpoint file to need
 * it, and the first three copies had already drifted into three different 403 bodies. Only the id
 * parse is local, because it is the part that is genuinely about this file's `/:id/…` routes.
 */
function requireSiteAdminCaller(req: PayloadRequest): number {
  assertSiteAdmin(req)
  const targetId = Number(req.routeParams?.id)
  if (!Number.isFinite(targetId)) throw new APIError('Missing user id', 400)
  return targetId
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
      return json(
        {
          errors: [
            {
              message: `Too many reset links generated — please wait ${budget.retryAfterSec}s.`,
            },
          ],
        },
        429,
        { ...NO_STORE, 'Retry-After': String(budget.retryAfterSec) },
      )
    }

    const shouldCommit = await initTransaction(req)
    try {
      // Global key BEFORE the row lock — see the ⚑ in this file's header.
      await takeAdminCountLock(req)
      const target = await lockAndVerifyFresh<User>(
        req,
        'users',
        targetId,
        expectedUpdatedAt,
        'This account changed since you loaded the page — reload before changing it.',
      )
      if (target.signInDisabled) {
        throw new APIError(
          'This account’s sign-in is disabled — re-enable it before generating a reset link.',
          409,
        )
      }

      // Only NOW is the allowance granted, and only AROUND this one call. Both preconditions have
      // been met: the caller is an authorized Site Admin, and the admin cap above was consumed.
      // The wrapper takes the allowance away again in a `finally`, so nothing added after this
      // inherits it.
      const token = await withAdminResetLinkAllowance(req, () =>
        forgotPasswordOperation({
          collection: req.payload.collections.users,
          // Same `as never` idiom as `forgotPassword.ts`: the installed arg type demands a
          // `password` it never reads.
          data: { email: target.email } as never,
          disableEmail: true,
          req,
        }),
      )
      if (!token) {
        // Can't-happen: the target was just read by id inside this transaction. Fail loudly rather
        // than returning a link-shaped string with an empty token.
        throw new APIError('Could not generate a reset link for this account.', 500)
      }

      // ⚑ MINTING MOVED `updatedAt`, so the caller's freshness token is now stale.
      // `forgotPasswordOperation` writes `resetPasswordToken`/`resetPasswordExpiration` through
      // `payload.update` (verified in installed source), which bumps the row. A caller that reveals a
      // link and then performs any other row action with the `expectedUpdatedAt` it started with
      // would get a spurious 409. Returning the NEW value lets the panel carry on without a refetch;
      // it is part of the response contract, not a convenience.
      const minted = (await req.payload.findByID({
        collection: 'users',
        id: targetId,
        depth: 0,
        select: { updatedAt: true },
        overrideAccess: true,
        req,
      })) as User

      if (shouldCommit) await commitTransaction(req)

      // ⚑ THE TOKEN IS NEVER LOGGED. It is a live credential and the logger is a JSON stream, so
      // there is deliberately no `payload.logger` call anywhere in this file. That is enforced, not
      // merely intended: `tests/unit/resetLinkNotLogged.spec.ts` parses this file and fails on any
      // `logger` access. An earlier version of this comment claimed an integration test did so and
      // none existed — a claim in a comment is not a guard, which is why that spec now exists.
      return json(
        {
          ok: true,
          link: `${emailLinkBase()}/reset-password?token=${token}`,
          // The post-mint value — see the ⚑ above. Callers must use THIS for their next action.
          updatedAt: minted.updatedAt,
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
        // Global key BEFORE the row lock — see the ⚑ in this file's header.
        await takeAdminCountLock(req)
        const target = await lockAndVerifyFresh<User>(
          req,
          'users',
          targetId,
          expectedUpdatedAt,
          'This account changed since you loaded the page — reload before changing it.',
        )

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
