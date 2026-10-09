/**
 * Wire-level authorization for the `system-settings` global.
 *
 * ⚑ THIS FILE EXISTS BECAUSE ITS ABSENCE HID A REAL HOLE. Part 1 (#265) shipped
 * `access: { read: siteAdminOnly, update: siteAdminOnly }` alongside a design requiring password
 * re-authentication, a freshness token, an acknowledgement and provenance on every settings write — and
 * nothing checked whether the ordinary REST door was still open. It was: a Site Administrator could
 * `POST /api/globals/system-settings` — the verb Payload actually routes — and skip all four.
 *
 * ⚑ AND THE INTERVENING "FIX" DID NOT CLOSE IT. #266 added `admin: { hidden: true }`, which I described
 * as closing the contradiction. `globals/operations/update.js` never consults `admin.hidden` — it gates
 * on `executeAccess` alone — so hiding the global removed the admin FORM and left the API untouched. A
 * narrowed surface reported as a shut door, and only a wire test can tell those apart.
 *
 * So the assertion that matters here is the SITE ADMINISTRATOR's refusal. Every other role failing
 * proves ordinary access control works; the Site Administrator failing proves the Save endpoint is the
 * sole writer, which is the thing the whole ceremony rests on.
 *
 * HOW IT RUNS: like the rest of `tests/http` — a running app plus a seedable DB, MARK-tagged and
 * self-cleaning, over the real network at `E2E_BASE_URL`:
 *
 *   scripts/in-deps.sh --network lesson3_default --env-file .env \
 *     -e E2E_BASE_URL=http://app:3000 -- npm run test:http
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import { clearRateLimitBuckets, drizzleOf, rowsOf } from '../helpers/db.js'
import { stillPendingAfterWindow, whileLockHeld } from '../helpers/rowLocks.js'
import { SYSTEM_SETTINGS_LOCK } from '../../src/endpoints/systemSettingsSave.js'
import {
  createUserVerified,
  deleteUserFixture,
  MARK,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'
import { login, url } from '../helpers/httpWire.js'
import type { User } from '../../src/payload-types.js'

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

let fx: RoleFixture
/**
 * ⚑ FIXTURE KEY IS NOT A USER TYPE. `editor` is the key `setupRoleFixture` uses; the user it names is a
 * **Teacher with editing access**. CLAUDE.md and SPEC §8 are explicit that "Editor" is not one of the
 * three types and must not appear as one in prose — and a test name IS prose: it is what a person reads
 * in a failure report. (It also read "a editor".)
 */
const LABEL: Record<'subjectAdmin' | 'editor' | 'teacher', string> = {
  subjectAdmin: 'Subject Administrator',
  editor: 'Teacher with editing access',
  teacher: 'Teacher',
}

const token: Record<string, string> = {}

const GLOBAL_URL = () => url('/api/globals/system-settings')

/**
 * ⚑ THE WRITE VERB IS `POST`, NOT `PATCH`. Measured against the running app: `POST` → 403,
 * `PATCH` → 404, `PUT` → 404. Payload routes a global update as POST, so a PATCH-based test probes a
 * route that does not exist — and would have "passed" the moment its expectation included 404, proving
 * nothing about authorization. Worth stating because PATCH is the natural guess (it is the verb the
 * `users` endpoints use, and what the earlier draft of this file assumed).
 */
async function request(method: 'GET' | 'POST', as?: RoleKey): Promise<{ status: number }> {
  const authToken = as ? token[as] : undefined
  if (as && !authToken) throw new Error(`no token for ${as} — fixture login did not complete`)

  const res = await fetch(GLOBAL_URL(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `JWT ${authToken}` } : {}),
    },
    ...(method === 'GET'
      ? {}
      : { body: JSON.stringify({ features: { publicLibraryLive: false } }) }),
  })
  return { status: res.status }
}

/** Read through the Local API, so the assertion cannot be fooled by a serialization quirk. */
async function storedFlag(): Promise<boolean | null | undefined> {
  const doc = await fx.payload.findGlobal({
    slug: 'system-settings',
    depth: 0,
    overrideAccess: true,
  })
  return (doc.features as { publicLibraryLive?: boolean | null } | undefined)?.publicLibraryLive
}

beforeAll(async () => {
  fx = await setupRoleFixture()
  const tokens = await Promise.all(ROLES.map((k) => login(fx.users[k].email, fx.password)))
  ROLES.forEach((k, i) => (token[k] = tokens[i]!))
  // A known starting value, written the way the Save endpoint will.
  await fx.payload.updateGlobal({
    slug: 'system-settings',
    data: { features: { publicLibraryLive: true } } as never,
    overrideAccess: true,
    user: fx.users.siteAdmin,
  })
})

afterAll(async () => {
  // Every Save re-authenticates through Payload's login, which spends the caller's `login` budget —
  // return exactly the rows this file spent (the limiter-spec convention, DECISIONS 2026-08-30).
  if (fx) await clearRateLimitBuckets(fx.payload, `login:${fx.users.siteAdmin.email.toLowerCase()}`)
  await fx?.teardown()
})

describe('system-settings — the ordinary write door is shut', () => {
  /**
   * ⚑ THE CASE THIS FILE IS FOR. Not "a Teacher cannot write settings" — obviously — but "the person
   * who legitimately administers everything still cannot write them THIS WAY", because the write has to
   * carry a re-authentication and an acknowledgement that only the Save endpoint asks for.
   */
  it('refuses a Site Administrator writing the global directly, and changes nothing', async () => {
    const before = await storedFlag()
    const res = await request('POST', 'siteAdmin')
    expect(
      res.status,
      'a Site Administrator must not write settings through the ordinary door',
    ).toBe(403)
    expect(await storedFlag(), 'the refused write must not have landed').toBe(before)
  })

  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${LABEL[role]} writing the global`, async () => {
      expect((await request('POST', role)).status).toBe(403)
    })
  }

  it('refuses an unauthenticated write', async () => {
    // 401 or 403 depending on how Payload frames an anonymous denial; either is a refusal, and pinning
    // the exact code here would test Payload rather than this boundary. ⚑ NOT 404 — a 404 would mean
    // the verb is unrouted and the test is probing nothing (see the note on `request`).
    expect([401, 403]).toContain((await request('POST')).status)
  })
})

describe('system-settings — reads stay Site-Admin-only', () => {
  it('lets a Site Administrator read it', async () => {
    expect((await request('GET', 'siteAdmin')).status).toBe(200)
  })

  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${LABEL[role]} reading it`, async () => {
      expect((await request('GET', role)).status).toBe(403)
    })
  }

  it('refuses an unauthenticated read', async () => {
    expect([401, 403]).toContain((await request('GET')).status)
  })
})

// ─── The Save endpoint: the sole writer ────────────────────────────────────────────────────────────

const SAVE_URL = () => url('/api/globals/system-settings/save')

interface SaveResult {
  status: number
  body: { errors?: { message?: string }[]; updatedAt?: string } | null
}

/** POST a Save as `authToken` (or anonymously). */
async function save(authToken: string | undefined, body: unknown): Promise<SaveResult> {
  const res = await fetch(SAVE_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `JWT ${authToken}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as SaveResult['body'] }
}

/** The stored state, read through the Local API so a serialization quirk cannot fool the assertion. */
async function stored(): Promise<{
  updatedAt: string
  forumEnabled: boolean | null | undefined
  forumChange?: { enabled?: boolean | null; changedBy?: unknown }
}> {
  const doc = (await fx.payload.findGlobal({
    slug: 'system-settings',
    depth: 0,
    overrideAccess: true,
  })) as {
    updatedAt: string
    features?: { forumEnabled?: boolean | null }
    flagChanges?: { flag: string; enabled?: boolean | null; changedBy?: unknown }[]
  }
  return {
    updatedAt: doc.updatedAt,
    forumEnabled: doc.features?.forumEnabled,
    forumChange: doc.flagChanges?.find((r) => r.flag === 'forumEnabled'),
  }
}

/** A Save body asking for `forumEnabled = value`, against the CURRENT token. */
async function bodyFor(value: boolean, password = fx.password) {
  return {
    changes: { forumEnabled: value },
    password,
    expectedUpdatedAt: (await stored()).updatedAt,
  }
}

/** The account's live sessions — the password check must leave them exactly as it found them. */
async function sessionIds(userId: number): Promise<string[]> {
  const rows = rowsOf<{ id: string }>(
    await drizzleOf(fx.payload).execute(
      sql`SELECT id FROM users_sessions WHERE _parent_id = ${userId} ORDER BY id`,
    ),
  )
  return rows.map((r) => r.id)
}

const messageOf = (r: SaveResult) => r.body?.errors?.[0]?.message ?? ''

describe('Save endpoint — who may call it', () => {
  it('refuses an unauthenticated Save', async () => {
    const before = await stored()
    expect((await save(undefined, await bodyFor(!before.forumEnabled))).status).toBe(401)
    expect((await stored()).updatedAt).toBe(before.updatedAt)
  })

  for (const role of ['subjectAdmin', 'editor', 'teacher'] as const) {
    it(`refuses a ${LABEL[role]}, even with their own correct password, and writes nothing`, async () => {
      const before = await stored()
      const res = await save(token[role], await bodyFor(!before.forumEnabled))
      expect(res.status).toBe(403)
      expect((await stored()).updatedAt).toBe(before.updatedAt)
    })
  }
})

describe('Save endpoint — a Site Administrator', () => {
  /**
   * ⚑ THE OTHER HALF OF THE PAIR. The first describe proves this same Site Administrator cannot write
   * the global through the ordinary door; this proves the Save is the door that works — with provenance
   * naming them, and without leaving a session behind from the password check.
   */
  it('saves a flag, stamps provenance with the real actor, and leaves sessions as found', async () => {
    const admin = fx.users.siteAdmin
    const before = await stored()
    const sessionsBefore = await sessionIds(admin.id)
    const target = !(before.forumEnabled === true)

    const res = await save(token.siteAdmin, await bodyFor(target))
    expect(res.status, messageOf(res)).toBe(200)

    const after = await stored()
    expect(after.forumEnabled).toBe(target)
    expect(after.updatedAt).toBe(res.body?.updatedAt)
    expect(after.forumChange?.enabled).toBe(target)
    expect(after.forumChange?.changedBy).toBe(admin.id)
    expect(
      await sessionIds(admin.id),
      'the re-authentication login must revoke the session it minted',
    ).toEqual(sessionsBefore)

    // Put it back, through the same door.
    expect((await save(token.siteAdmin, await bodyFor(!target))).status).toBe(200)
  })

  it('refuses a wrong password with 401, and writes nothing', async () => {
    const before = await stored()
    const res = await save(token.siteAdmin, await bodyFor(!before.forumEnabled, 'not-the-password'))
    expect(res.status).toBe(401)
    expect(messageOf(res)).toBe('That password is not correct.')
    expect(await stored()).toEqual(before)
  })

  it('refuses a stale freshness token with 409, and writes nothing', async () => {
    const before = await stored()
    const res = await save(token.siteAdmin, {
      changes: { forumEnabled: !before.forumEnabled },
      password: fx.password,
      expectedUpdatedAt: new Date(Date.parse(before.updatedAt) - 60_000).toISOString(),
    })
    expect(res.status).toBe(409)
    expect(await stored()).toEqual(before)
  })

  it('refuses the stored-but-unsaveable public-library flag, and writes nothing', async () => {
    const before = await stored()
    const res = await save(token.siteAdmin, {
      changes: { publicLibraryLive: false },
      password: fx.password,
      expectedUpdatedAt: before.updatedAt,
    })
    expect(res.status).toBe(400)
    expect(await stored()).toEqual(before)
  })

  it('refuses an oversized body before reading it', async () => {
    const res = await save(token.siteAdmin, JSON.stringify({ padding: 'x'.repeat(64 * 1024) }))
    expect(res.status).toBe(413)
  })

  /**
   * ⚑ THE SETTINGS LOCK MAKES A SAVE *WAIT*, asserted directly — the `officialPointerLock.int.spec.ts`
   * pattern (`tests/helpers/rowLocks.ts`).
   *
   * ⚑ A RACE OF TWO REAL SAVES DOES NOT TEST THIS, and the first version of this case was one. It fired
   * two Saves with the same token and expected one 200 and one 409 — and stayed GREEN with the lock
   * removed: each Save's re-authentication login writes the same user row, so the two requests queued
   * behind each other before either reached the compare, and the second always saw the first's write.
   * It was measuring the login, not the lock (mutation-tested 2026-10-09). So: hold the lock from an
   * independent transaction, prove a Save blocks on it, change the settings underneath it, release —
   * and the Save must then refuse with 409 rather than write over a change it never saw. Without the
   * lock it completes inside the window with a 200, and both assertions fail.
   */
  it('makes a Save wait on the settings lock, then refuse a change made while it waited', async () => {
    const before = await stored()
    let saving!: Promise<SaveResult>
    let blocked = false

    await whileLockHeld(
      fx.payload,
      sql`SELECT pg_advisory_xact_lock(${SYSTEM_SETTINGS_LOCK.classifier}, ${SYSTEM_SETTINGS_LOCK.key})`,
      async () => {
        saving = save(token.siteAdmin, {
          changes: { forumEnabled: !before.forumEnabled },
          password: fx.password,
          expectedUpdatedAt: before.updatedAt,
        })
        blocked = await stillPendingAfterWindow(saving)
        // Another administrator's change lands while the Save is waiting.
        await fx.payload.updateGlobal({
          slug: 'system-settings',
          data: { features: { forumEnabled: before.forumEnabled === true } } as never,
          overrideAccess: true,
          user: fx.users.siteAdmin,
        })
      },
    )

    expect(
      blocked,
      'the Save must block on the settings lock rather than compare a stale read',
    ).toBe(true)
    const res = await saving
    expect(res.status, messageOf(res)).toBe(409)
    expect((await stored()).forumEnabled).toBe(before.forumEnabled)
  }, 30_000)
})

describe('Save endpoint — the password check is not a guessing oracle', () => {
  /**
   * ⚑ RE-AUTHENTICATION INHERITS PAYLOAD'S ACCOUNT LOCKOUT: repeated wrong passwords on the Save lock the
   * account exactly as they would at the sign-in form, so the Save is no better a place to guess. (It
   * does NOT prove where the login runs relative to the Save's transaction, and an earlier comment here
   * said it did: Payload records failed attempts outside any transaction by design, so the lock engages
   * either way.) A dedicated Site Administrator, so locking it cannot disturb the rest of this file.
   */
  let locked: User | undefined

  afterAll(async () => {
    if (!locked) return
    await clearRateLimitBuckets(fx.payload, `login:${locked.email.toLowerCase()}`)
    await deleteUserFixture(fx.payload, locked.id)
  })

  it('locks the account after repeated wrong passwords — then refuses even the right one', async () => {
    locked = await createUserVerified(fx.payload, {
      email: `${MARK}lockout-admin@example.test`.toLowerCase(),
      name: `${MARK}Lockout Admin`,
      password: fx.password,
      roles: ['siteAdmin'],
    })
    const lockedToken = await login(locked.email, fx.password)
    const before = await stored()

    for (let i = 0; i < 5; i++) {
      const res = await save(lockedToken, await bodyFor(!before.forumEnabled, 'wrong'))
      expect(res.status, `attempt ${i + 1}`).toBe(401)
    }
    const res = await save(lockedToken, await bodyFor(!before.forumEnabled))
    expect(res.status).toBe(401)
    expect(
      messageOf(res),
      'a locked account is told it is locked, not that its password is wrong',
    ).toMatch(/locked/i)
    expect(await stored()).toEqual(before)
  })
})
