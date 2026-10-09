/**
 * The System panel's Save — the SOLE writer of the `system-settings` global
 * (`docs/DESIGN-system-panel-2026-08-21.md`, "THE SAVE ENDPOINT MUST BE THE SOLE WRITER" and "Save").
 *
 *   POST /api/globals/system-settings/save
 *   body: { changes: { forumEnabled: boolean }, password: string, expectedUpdatedAt: string }
 *
 * The global's `access.update` is `() => false` for everyone, Site Administrators included, so this is
 * the only way a flag changes. In order:
 *
 *   1. authorize — signed out 401, not a Site Administrator 403 (`assertSiteAdmin`);
 *   2. read a size-capped body and validate it — an explicit allowlist, never a passthrough (400/413);
 *   3. re-authenticate with the caller's password (401 wrong, 429 throttled, Payload's lockout) — see
 *      {@link reauthenticate};
 *   4. in ONE transaction: take the settings lock, re-read, refuse a stale `expectedUpdatedAt` (409),
 *      write on the trusted path (`overrideAccess: true`), and let `stampFlagChanges` record provenance.
 *
 * ⚑ NO ACKNOWLEDGEMENT STEP YET, and that is not an omission. The design's server-enforced, versioned
 * acknowledgement exists for transitions whose consequence is not obvious — the public library going
 * live. That flag is not saveable until it has an enforcement point ({@link SAVEABLE_FLAGS}), and
 * switching Discussions on or off needs no warning, so the mechanism would have no caller. It arrives
 * with the first flag that needs it.
 *
 * ⚑ THE PASSWORD NEVER REACHES A LOG. Nothing here logs the body, and errors from the login operation
 * are re-thrown with a message of our own rather than wrapped around the request.
 */
import {
  APIError,
  AuthenticationError,
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  logoutOperation,
  type Endpoint,
  type PayloadRequest,
} from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { txDb } from '../lib/txDb'
import type { SystemFlag } from '../globals/SystemSettings'
import type { User } from '../payload-types'
import {
  assertSiteAdmin,
  json,
  MAX_CONTROL_BODY_BYTES,
  readJsonBody,
  requireExpectedUpdatedAt,
} from './respond'

/**
 * The flags this endpoint may change — a SUBSET of `SYSTEM_FLAGS`, deliberately.
 *
 * ⚑ `publicLibraryLive` IS NOT HERE. Nothing enforces it yet (`lib/publicLibrary.ts` reads only the env
 * ceiling), so a writable switch would change a value no reader consults — the "never render a toggle
 * for something absent" rule, applied to the API as well as the panel. It joins this list in the PR
 * that gives it an enforcement point, together with the acknowledgement its "goes public" warning needs.
 *
 * Defined here rather than beside `SYSTEM_FLAGS`, because the global imports this module to mount it;
 * a value import back would be a runtime cycle. The `satisfies` keeps it a subset at compile time.
 */
export const SAVEABLE_FLAGS = ['forumEnabled'] as const satisfies readonly SystemFlag[]
export type SaveableFlag = (typeof SAVEABLE_FLAGS)[number]

/**
 * This global's advisory-lock family. A classifier of its own (ASCII "SYST") so it cannot collide with
 * the users-collection family in `hooks/userRoles.ts`.
 *
 * ⚑ AN ADVISORY LOCK, NOT A ROW LOCK. The freshness check is a read-then-compare followed by a separate
 * write, so two simultaneous Saves carrying the same token would both pass the compare without a lock —
 * a freshness token is not atomicity (design, "Save"). A `SELECT … FOR UPDATE` on `system_settings`
 * would serialise them only if the row exists, and on an installation where it did not, it would lock
 * nothing; the advisory key needs no row.
 */
export const SYSTEM_SETTINGS_LOCK = { classifier: 1398362964, key: 1 } as const

const MAX_PASSWORD_LENGTH = 1024
const STALE_MESSAGE = 'Settings changed since you loaded them — reload before saving.'

export interface SaveBody {
  changes: Partial<Record<SaveableFlag, boolean>>
  password: string
  expectedUpdatedAt: string
}

/**
 * Validate an untrusted Save body. Throws `APIError` 400 on anything but the exact allowed shape.
 *
 * Exported for `tests/unit/systemSettingsSave.spec.ts`, so the allowlist is asserted directly.
 */
export function parseSaveBody(raw: unknown): SaveBody {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new APIError('Expected a JSON object.', 400)
  }
  const body = raw as Record<string, unknown>

  const { password } = body
  if (typeof password !== 'string' || password === '' || password.length > MAX_PASSWORD_LENGTH) {
    throw new APIError('Enter your password to save settings.', 400)
  }

  const expectedUpdatedAt = requireExpectedUpdatedAt(
    body.expectedUpdatedAt,
    'expectedUpdatedAt is required — reload the settings before saving.',
  )

  const rawChanges = body.changes
  if (!rawChanges || typeof rawChanges !== 'object' || Array.isArray(rawChanges)) {
    throw new APIError('Expected the settings to change.', 400)
  }
  const entries = Object.entries(rawChanges)
  if (entries.length === 0) throw new APIError('Nothing to save.', 400)
  const changes: Partial<Record<SaveableFlag, boolean>> = {}
  for (const [flag, value] of entries) {
    if (!(SAVEABLE_FLAGS as readonly string[]).includes(flag)) {
      throw new APIError(`"${flag}" is not a setting that can be changed here.`, 400)
    }
    if (typeof value !== 'boolean') {
      throw new APIError(`"${flag}" must be true or false.`, 400)
    }
    changes[flag as SaveableFlag] = value
  }

  return { changes, password, expectedUpdatedAt }
}

/** The session id a freshly minted Payload JWT carries — the token never leaves this module. */
function sessionIdOf(token: string | undefined): string {
  const segment = token?.split('.')[1]
  const sid = segment
    ? (JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { sid?: unknown }).sid
    : undefined
  if (typeof sid !== 'string' || sid === '') {
    // Fail closed: a session we cannot name is a session we cannot revoke, so nothing is saved.
    throw new Error('re-authentication produced a session without an id; refusing to continue')
  }
  return sid
}

/**
 * Confirm the caller's password with Payload's own login, then revoke the session that login minted.
 *
 * ⚑ PAYLOAD'S LOGIN, NOT A COPY OF ITS HASH CHECK (operator decision 2026-10-09). The password
 * comparison is not exported, and re-implementing it would duplicate security-sensitive code an
 * upgrade could silently diverge from. `payload.login` brings, for free: the hash check, Payload's
 * account lockout (`maxLoginAttempts`), `refuseDisabledLogin`, and the existing `login`/`loginGlobal`
 * rate limits keyed on the caller's own address (`hooks/authRateLimit.ts`) — the "per user AND
 * globally" re-auth budget the design asks for, without a second limiter.
 *
 * ⚑ ITS OWN REQUEST, AND BEFORE THE SAVE'S TRANSACTION. `loginOperation` assigns `req.user`, so it must
 * not run on the endpoint's request; and running it first keeps the deliberately slow password hash
 * and its writes to the user row out of the settings lock's critical section.
 *
 * ⚑ NOT FOR LOCKOUT'S SAKE — an earlier version of this comment said it was, and was wrong. It claimed
 * a failed attempt inside the Save's transaction would be rolled back and lockout would never
 * accumulate. Payload already prevents that: `incrementLoginAttempts` deliberately writes WITHOUT `req`,
 * outside any transaction, so parallel requests see the count. A mutation that moved this call inside
 * the transaction left the lockout test green, which is how the claim was caught (DECISIONS 2026-10-09).
 *
 * ⚑ THE MINTED SESSION IS REVOKED AT ONCE. `useSessions` is on, so every login adds a session; its token
 * is never sent anywhere, and revoking it (Payload's own `logoutOperation`, which drops exactly
 * `req.user._sid`) means a Save leaves the account's sessions as it found them. If that revoke fails,
 * the Save fails with it.
 */
async function reauthenticate(req: PayloadRequest, password: string): Promise<void> {
  const email = (req.user as User).email
  let result: Awaited<ReturnType<PayloadRequest['payload']['login']>>
  try {
    result = await req.payload.login({ collection: 'users', data: { email, password }, depth: 0 })
  } catch (err) {
    // ⚑ BY CLASS, NOT BY STATUS. Payload's `LockedAuth` is ALSO a 401, so mapping every 401 would tell
    // a locked-out administrator typing the RIGHT password that it is wrong. Only a wrong password is
    // reworded; a lock, a throttle (429) or a disabled account keeps Payload's own answer. If the class
    // check ever fails (the 2026-10-08 minifier defect), the degradation is Payload's generic
    // "email or password" message — still true, never a false one.
    if (err instanceof AuthenticationError) {
      throw new APIError('That password is not correct.', 401)
    }
    throw err
  }

  const sid = sessionIdOf(result.token)
  const revokeReq = await createLocalReq(
    { user: { ...result.user, collection: 'users', _sid: sid } as never },
    req.payload,
  )
  await logoutOperation({ collection: req.payload.collections.users, req: revokeReq })
}

export const saveSystemSettingsEndpoint: Endpoint = {
  path: '/save',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    assertSiteAdmin(req)
    const body = parseSaveBody(await readJsonBody(req, MAX_CONTROL_BODY_BYTES))
    await reauthenticate(req, body.password)

    const shouldCommit = await initTransaction(req)
    try {
      const db = await txDb(req, { requireTransaction: true })
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(${SYSTEM_SETTINGS_LOCK.classifier}, ${SYSTEM_SETTINGS_LOCK.key})`,
      )
      // Read AFTER the lock: reading first would let two Saves with the same fresh token both pass.
      const current = await req.payload.findGlobal({
        slug: 'system-settings',
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (Date.parse(String(current.updatedAt)) !== Date.parse(body.expectedUpdatedAt)) {
        throw new APIError(STALE_MESSAGE, 409)
      }

      const updated = await req.payload.updateGlobal({
        slug: 'system-settings',
        data: { features: { ...current.features, ...body.changes } },
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (shouldCommit) await commitTransaction(req)
      return json({ ok: true, updatedAt: updated.updatedAt, features: updated.features })
    } catch (e) {
      await killTransaction(req)
      throw e
    }
  },
}
