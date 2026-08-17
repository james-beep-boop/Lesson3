/**
 * The user security foundation (PR 2a of `docs/DESIGN-manage-accordion-2026-08-16.md`): disabling
 * sign-in, the last-Site-Admin invariant, and the admin reset-link carve-out.
 *
 * Drives the REAL Payload operations through the Local API, so the same hooks the REST routes run
 * fire here — `beforeLogin`, `beforeChange`, `beforeDelete` — against the real database and the real
 * `rate_limit_counters` table. Requires a DB → Rock/CI only, like all of `tests/int`.
 *
 * ⚑ The wire SHAPE of the disabled refusal is pinned separately and without a database in
 * `tests/unit/accountDisabledContract.spec.ts`. This file asserts BEHAVIOUR; that one asserts the
 * contract the client forms key on. Neither substitutes for the other.
 */
import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { createUserVerified } from '../helpers/fixtures.js'
import { ACCOUNT_DISABLED_CODE } from '../../src/errors/AccountDisabled.js'
import { ADMIN_COUNT_LOCK } from '../../src/hooks/userRoles.js'
import { stillPendingAfterWindow } from '../helpers/rowLocks.js'

const RUN = `usersec-${Date.now()}`
const PASSWORD = `pw-${RUN}-Str0ng!`
const mkEmail = (who: string) => `${RUN}-${who}@lesson3.local`

let payload: Payload
const created: number[] = []

/** A verified account, tracked for teardown. */
async function mkUser(who: string, data: Record<string, unknown> = {}): Promise<number> {
  const u = await createUserVerified(payload, {
    email: mkEmail(who),
    password: PASSWORD,
    name: `${RUN} ${who}`,
    ...data,
  })
  created.push(u.id)
  return u.id
}

/** Set `signInDisabled` the way the ENDPOINT does — system-set, so it needs overrideAccess. */
async function setDisabled(id: number, value: boolean, extra: Record<string, unknown> = {}) {
  return payload.update({
    collection: 'users',
    id,
    data: { signInDisabled: value, ...(value ? { sessions: [] } : {}), ...extra } as never,
    overrideAccess: true,
  })
}

/**
 * A permanent Site Administrator, created FIRST.
 *
 * ⚑ THIS EXISTS BECAUSE OF `grantSiteAdminToFirstUser`. On a fresh `lesson3_test` the first account
 * created becomes a Site Admin automatically — so without a deliberate keeper, this spec's own first
 * fixture silently became one and then tripped the last-admin guard when the test tried to disable
 * it. Absorbing the bootstrap grant into a named account makes every LATER fixture an ordinary user,
 * which is what the login-gate tests assume.
 */
let keeperAdminId = 0

beforeAll(async () => {
  payload = await getPayload({ config })
  keeperAdminId = await mkUser('keeper-admin', { roles: ['siteAdmin'] })
  // Belt and braces: if this run was NOT the first in the database, the bootstrap hook did nothing
  // and the explicit role above is what makes the keeper an administrator. Either way it is one.
  await payload.update({
    collection: 'users',
    id: keeperAdminId,
    data: { roles: ['siteAdmin'] } as never,
    overrideAccess: true,
  })
}, 60_000)

afterAll(async () => {
  for (const id of created) {
    await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
  }
  await payload.db.drizzle
    .execute(sql`DELETE FROM rate_limit_counters WHERE key LIKE ${`%${RUN}%`}`)
    .catch(() => undefined)
})

describe('signInDisabled — the login gate', () => {
  it('refuses login with the machine-readable code, not a bare message', async () => {
    const id = await mkUser('gate')
    await setDisabled(id, true)
    await expect(
      payload.login({ collection: 'users', data: { email: mkEmail('gate'), password: PASSWORD } }),
    ).rejects.toMatchObject({ data: { code: ACCOUNT_DISABLED_CODE } })
  })

  it('lets the same account back in once re-enabled', async () => {
    // The inverse, so the test above cannot pass because of an unrelated login failure — a refusal
    // test with no positive control proves only that login is broken.
    const id = await mkUser('reenable')
    await setDisabled(id, true)
    await setDisabled(id, false)
    const res = await payload.login({
      collection: 'users',
      data: { email: mkEmail('reenable'), password: PASSWORD },
    })
    expect(res.token).toBeTruthy()
  })

  /**
   * ⚑ THE PARTIAL-DISABLEMENT TEST. Setting the flag WITHOUT clearing sessions leaves an account
   * "disabled" whose holder is still signed in for up to two hours, while every UI reports success.
   * The endpoint writes both atomically; this asserts the mechanism it relies on actually terminates
   * a live session, rather than trusting the claim about Payload internals.
   */
  it('clearing sessions kills a LIVE token immediately, not at expiry', async () => {
    const id = await mkUser('live')
    const { token } = await payload.login({
      collection: 'users',
      data: { email: mkEmail('live'), password: PASSWORD },
    })
    expect(token).toBeTruthy()

    // Sanity: the token authenticates BEFORE disabling. Without this the assertion below could pass
    // against a token that never worked.
    const before = await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })
    expect(before.user?.id).toBe(id)

    await setDisabled(id, true)

    const after = await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })
    expect(after.user).toBeNull()
  })

  it('a disabled user cannot CONSUME a valid reset token, and the password is unchanged', async () => {
    // `resetPassword` runs `beforeLogin` inline before signing its token, so the gate rejects the
    // reset itself. The password must roll back — a half-applied reset would be worse than a refusal.
    const id = await mkUser('resetblocked')
    const token = await payload.forgotPassword({
      collection: 'users',
      data: { email: mkEmail('resetblocked') },
      disableEmail: true,
    })
    await setDisabled(id, true)

    await expect(
      payload.resetPassword({
        collection: 'users',
        data: { token: String(token), password: 'a-brand-new-Password1!' },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ data: { code: ACCOUNT_DISABLED_CODE } })

    // Re-enable and prove the ORIGINAL password still works — i.e. the rejected reset changed nothing.
    await setDisabled(id, false)
    const res = await payload.login({
      collection: 'users',
      data: { email: mkEmail('resetblocked'), password: PASSWORD },
    })
    expect(res.token).toBeTruthy()
  })

  it('REQUESTING a reset stays uniform for a disabled account (no status oracle)', async () => {
    // The forgot-password path must not learn about `signInDisabled`: special-casing it would
    // reintroduce exactly the account-status oracle `endpoints/forgotPassword.ts` exists to close.
    const id = await mkUser('oracle')
    await setDisabled(id, true)
    const token = await payload.forgotPassword({
      collection: 'users',
      data: { email: mkEmail('oracle') },
      disableEmail: true,
    })
    // A token is still minted, exactly as for an enabled account. The refusal happens at CONSUMPTION.
    expect(token).toBeTruthy()
  })
})

/**
 * ⚑ THE LAST-ADMIN INVARIANT IS GLOBAL, so these tests must control the whole population — and the
 * first draft did not, which is why they all failed on the first run. Two sources of stray
 * administrators:
 *
 *   - `grantSiteAdminToFirstUser` makes the FIRST account in a fresh database a Site Admin, so this
 *     spec's own first fixture silently became one.
 *   - `test:int` shares one database across specs, so anything another spec created is still there.
 *
 * The fix is to park every OTHER administrator for the duration, via raw SQL that bypasses the very
 * hooks under test (a Payload update would be refused by the guard itself — the guard cannot be used
 * to set up its own preconditions), then restore them. Restoring matters: a later spec in the same
 * run may legitimately expect an administrator to exist.
 */
let parkedAdminIds: number[] = []

async function parkOtherAdmins(keep: number[]): Promise<void> {
  const rows = (await payload.db.drizzle.execute(
    sql`SELECT parent_id FROM users_roles WHERE value = 'siteAdmin'`,
  )) as unknown as { rows: { parent_id: number }[] }
  parkedAdminIds = rows.rows.map((r) => Number(r.parent_id)).filter((id) => !keep.includes(id))
  // One statement per id rather than `= ANY($1)`: the array binding is the kind of detail that fails
  // silently (deleting nothing, so the guard sees stray admins and the test fails for the wrong
  // reason), and the list here is a handful of rows.
  for (const id of parkedAdminIds) {
    await payload.db.drizzle.execute(
      sql`DELETE FROM users_roles WHERE value = 'siteAdmin' AND parent_id = ${id}`,
    )
  }
}

async function restoreParkedAdmins(): Promise<void> {
  for (const id of parkedAdminIds) {
    await payload.db.drizzle.execute(
      sql`INSERT INTO users_roles ("order", parent_id, value) VALUES (0, ${id}, 'siteAdmin')`,
    )
  }
  parkedAdminIds = []
}

describe('the last-Site-Admin invariant', () => {
  afterEach(restoreParkedAdmins)

  it('refuses to demote the only administrator who can sign in', async () => {
    const only = await mkUser('onlyadmin', { roles: ['siteAdmin'] })
    await parkOtherAdmins([only])
    await expect(
      payload.update({
        collection: 'users',
        id: only,
        data: { roles: [] } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/last site administrator/i)
  })

  it('refuses to DISABLE the only administrator who can sign in', async () => {
    // Same invariant, different operation — this is why the guard is not "a roles hook".
    const only = await mkUser('onlyadmin2', { roles: ['siteAdmin'] })
    await parkOtherAdmins([only])
    await expect(setDisabled(only, true)).rejects.toThrow(/last site administrator/i)
  })

  it('refuses to DELETE the only administrator who can sign in', async () => {
    const only = await mkUser('onlyadmin3', { roles: ['siteAdmin'] })
    await parkOtherAdmins([only])
    await expect(
      payload.delete({ collection: 'users', id: only, overrideAccess: true }),
    ).rejects.toThrow(/last site administrator/i)
  })

  /**
   * ⚑ A DISABLED ADMINISTRATOR DOES NOT COUNT. This is the case that makes the guard's "usable"
   * wording load-bearing: with a plain role count, a disabled admin would "cover" the invariant and
   * the last ENABLED one could be demoted, locking everyone out.
   */
  it('does not count a DISABLED administrator as cover for demoting the enabled one', async () => {
    const enabled = await mkUser('cover-enabled', { roles: ['siteAdmin'] })
    const disabled = await mkUser('cover-disabled', { roles: ['siteAdmin'] })
    await setDisabled(disabled, true)
    await parkOtherAdmins([enabled, disabled])
    await expect(
      payload.update({
        collection: 'users',
        id: enabled,
        data: { roles: [] } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/last site administrator/i)
  })

  it('allows the demotion once a second usable administrator exists', async () => {
    // The positive control: without it, every assertion above would pass against a guard that
    // refuses unconditionally.
    const a = await mkUser('pair-a', { roles: ['siteAdmin'] })
    await mkUser('pair-b', { roles: ['siteAdmin'] })
    const res = await payload.update({
      collection: 'users',
      id: a,
      data: { roles: [] } as never,
      overrideAccess: true,
    })
    expect(res.roles ?? []).not.toContain('siteAdmin')
  })
})

describe('self-action guards', () => {
  it('an administrator cannot disable their own sign-in', async () => {
    const me = await mkUser('selfdisable', { roles: ['siteAdmin'] })
    await mkUser('selfdisable-other', { roles: ['siteAdmin'] }) // so the LAST-admin guard is not what fires
    const actor = (await payload.findByID({
      collection: 'users',
      id: me,
      overrideAccess: true,
    })) as never
    await expect(
      payload.update({
        collection: 'users',
        id: me,
        data: { signInDisabled: true, sessions: [] } as never,
        overrideAccess: true,
        user: actor,
      }),
    ).rejects.toThrow(/your own sign-in/i)
  })

  it('an administrator cannot delete their own account', async () => {
    const me = await mkUser('selfdelete', { roles: ['siteAdmin'] })
    await mkUser('selfdelete-other', { roles: ['siteAdmin'] })
    const actor = (await payload.findByID({
      collection: 'users',
      id: me,
      overrideAccess: true,
    })) as never
    await expect(
      payload.delete({ collection: 'users', id: me, overrideAccess: true, user: actor }),
    ).rejects.toThrow(/your own account/i)
  })
})

/**
 * ⚑ THIS ASSERTS THE MECHANISM (that the guard WAITS on the shared key), not a replayed race — and
 * that choice is the result of mutation testing, not caution.
 *
 * The first version of this test drove a demote and a disable concurrently with `Promise.allSettled`
 * and asserted "exactly one succeeds". It passed. It also passed with the advisory lock DELETED,
 * which makes it a guess rather than a guard: two Local-API operations in one process do not reliably
 * interleave their transactions between the guard's COUNT and its write, which is the only window
 * that matters. `tests/int/officialPointerLock.int.spec.ts` records the identical lesson — two
 * earlier versions of that file raced the real operations and both passed against a reverted lock.
 *
 * So this pins what the fix actually consists of: with the shared key already held by an independent
 * transaction, a count-reducing operation must BLOCK rather than proceed from a stale count. That is
 * deterministic, needs no timing luck, and was watched going red against a reverted lock.
 *
 * What it deliberately does NOT claim is a reproduction of the destructive interleaving.
 */
describe('concurrency: the shared advisory key', () => {
  afterEach(restoreParkedAdmins)

  it('a demotion BLOCKS while another transaction holds the shared admin-count key', async () => {
    const a = await mkUser('race-a', { roles: ['siteAdmin'] })
    const b = await mkUser('race-b', { roles: ['siteAdmin'] })
    await parkOtherAdmins([a, b])

    // Hold ADMIN_COUNT_LOCK from a dedicated connection, exactly as a concurrent disable would.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let started!: () => void
    const holding = new Promise<void>((resolve) => (started = resolve))

    const holder = (
      payload.db.drizzle as unknown as {
        transaction: <T>(fn: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<T>) => Promise<T>
      }
    ).transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${ADMIN_COUNT_LOCK.classifier}, ${ADMIN_COUNT_LOCK.key})`,
      )
      started()
      await gate
    })
    await holding

    const demote = payload.update({
      collection: 'users',
      id: a,
      data: { roles: [] } as never,
      overrideAccess: true,
    })
    try {
      expect(
        await stillPendingAfterWindow(demote),
        'the demotion must wait on the shared admin-count key, not decide from a stale count',
      ).toBe(true)
    } finally {
      release()
      await holder
      await demote.catch(() => undefined)
    }
    // `b` is untouched — the point is the WAIT, not the outcome.
    expect(b).toBeTruthy()
  })
})
