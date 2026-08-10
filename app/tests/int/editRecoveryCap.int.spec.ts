/**
 * The per-user ACTIVE-capture cap in `start` (SPEC §5; design §8 cases C1-C5).
 *
 * ⚑ Cases enumerated before assertions, and the enumeration added TWO the original five did not have:
 * C7 (the cap is per USER — invisible in any single-user test) and C8 (a refusal creates no row).
 * Both are the kind that pass silently while the feature is broken for someone else.
 *
 * `maxActive` is injected rather than seeding twenty captures per test: the production constant is
 * fixed at 20, and a suite that had to build twenty versions per case would be slow enough that nobody
 * would extend it. The seam is kernel-only and unreachable over the wire.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { recoveryHarness, retireAllActiveFor, retireDirectly } from '../helpers/editRecovery.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const { makeVersion, startResult, rawRow, countRows } = recoveryHarness(() => fx)

/** A cap of 2 keeps every case to two or three versions while exercising the same predicate. */
const CAP = 2

/**
 * ⚑ Every test starts from an empty budget. The cap counts a user's active rows across ALL sources,
 * so without this each test inherits the previous one's captures and its seeding fails at capacity —
 * for a reason unrelated to what it is testing. Found the moment the suite first ran.
 */
beforeEach(async () => {
  await retireAllActiveFor(fx.payload, fx.users.editor.id)
  await retireAllActiveFor(fx.payload, fx.users.teacher.id)
})

/** Fill the user to exactly `CAP` active captures, returning the versions used. */
async function fillToCapacity(semvers: string[], userId = fx.users.editor.id) {
  const versions = []
  for (const semver of semvers) {
    const v = await makeVersion(semver)
    const res = await startResult(v.id, { userId, maxActive: CAP })
    expect(res.ok, `seeding ${semver} must succeed below the cap`).toBe(true)
    versions.push(v)
  }
  return versions
}

describe('active-capture cap', () => {
  it('C6 — below capacity, a new pair starts normally', async () => {
    const v = await makeVersion('1.3.1')
    const res = await startResult(v.id, { maxActive: CAP })
    expect(res.ok).toBe(true)
    expect((await rawRow(v.id))?.retired_at).toBeNull()
  })

  /**
   * C1 — the case that makes the cap safe to ship. Resume must NEVER be refused: it fires on every
   * Edit click and in every tab, so a cap that blocked it would lock a teacher out of work they
   * already have open. The row's own presence is what admits it, not the count.
   */
  it('C1 — resume an ALREADY-ACTIVE row at capacity SUCCEEDS, and stays a no-op', async () => {
    const [first] = await fillToCapacity(['1.3.2', '1.3.3'])
    const before = await rawRow(first.id)

    const res = await startResult(first.id, { maxActive: CAP })
    expect(res.ok, 'resume at capacity must succeed').toBe(true)
    if (!res.ok) return

    // ...and it is still a no-op: not the revision, not the TTL clock, not the baseline.
    const after = await rawRow(first.id)
    expect(Number(after?.revision)).toBe(Number(before?.revision))
    expect(after?.updated_at).toEqual(before?.updated_at)
    expect(after?.base_updated_at).toEqual(before?.base_updated_at)
    expect(res.token.revision).toBe(Number(before?.revision))
  })

  it('C2 — a NEW pair at capacity is refused, and no row is created', async () => {
    await fillToCapacity(['1.3.4', '1.3.5'])
    const fresh = await makeVersion('1.3.6')

    const res = await startResult(fresh.id, { maxActive: CAP })
    expect(res).toEqual({ ok: false, reason: 'at-capacity' })
    // C8: refusal leaves the table as it was.
    expect(await countRows(fresh.id), 'no row created').toBe(0)
  })

  /**
   * C3 — reactivation BEGINS a session, so it counts. The row exists, so the INSERT is still attempted
   * and the conflict fires; it is the DO UPDATE's own WHERE that refuses it. Without that clause a
   * user at capacity could reactivate without limit, which is the cap's most obvious bypass.
   */
  it('C3 — reactivating a RETIRED row at capacity is refused, and the marker is untouched', async () => {
    const retired = await makeVersion('1.3.7')
    expect((await startResult(retired.id, { maxActive: CAP })).ok).toBe(true)
    await retireDirectly(fx.payload, retired.id, fx.users.editor.id)
    const marker = await rawRow(retired.id)

    // Now fill the user's remaining capacity with live sessions.
    await fillToCapacity(['1.3.8', '1.3.9'])

    const res = await startResult(retired.id, { maxActive: CAP })
    expect(res).toEqual({ ok: false, reason: 'at-capacity' })

    const after = await rawRow(retired.id)
    expect(after?.retired_at, 'still retired').not.toBeNull()
    expect(Number(after?.generation), 'generation not advanced').toBe(Number(marker?.generation))
    expect(Number(after?.revision), 'revision not advanced').toBe(Number(marker?.revision))
  })

  /**
   * C5 — tombstones must not count. Without `retired_at IS NULL` in the count, anyone who had ever
   * edited twenty plans would be permanently locked out with zero live sessions — a slow, total
   * failure that looks like the cap working.
   */
  it('C5 — retiring one frees a slot: tombstones do not count', async () => {
    const [first] = await fillToCapacity(['1.3.10', '1.3.11'])
    const blocked = await makeVersion('1.3.12')
    expect((await startResult(blocked.id, { maxActive: CAP })).ok, 'at capacity').toBe(false)

    await retireDirectly(fx.payload, first.id, fx.users.editor.id)

    const res = await startResult(blocked.id, { maxActive: CAP })
    expect(res.ok, 'a retired row released the slot').toBe(true)
  })

  /**
   * C7 — the cap is PER USER, and this is the case a single-user suite cannot see. Without `user_id`
   * in the count, one prolific editor would cap everybody on the instance.
   */
  it('C7 — another user at capacity does not block this one', async () => {
    // The editor fills up.
    await fillToCapacity(['1.3.13', '1.3.14'], fx.users.editor.id)
    const editorBlocked = await makeVersion('1.3.15')
    expect((await startResult(editorBlocked.id, { maxActive: CAP })).ok).toBe(false)

    // The teacher, who has none, is unaffected — on the SAME source the editor was refused.
    const res = await startResult(editorBlocked.id, {
      userId: fx.users.teacher.id,
      maxActive: CAP,
    })
    expect(res.ok, 'a different user has their own budget').toBe(true)
    expect(await countRows(editorBlocked.id, fx.users.teacher.id)).toBe(1)
    expect(await countRows(editorBlocked.id, fx.users.editor.id)).toBe(0)
  })

  /**
   * C4 — the cap is APPROXIMATE by design (§5 says so). Two concurrent starts at capacity−1 both read
   * the same count and both insert, so the user can reach cap+1. That is accepted; what must not
   * happen is an unbounded run. Asserted rather than left implicit, so nobody later "fixes" it with a
   * lock that would serialise every Edit click.
   */
  it('C4 — concurrent starts may overshoot by one, but no further', async () => {
    await fillToCapacity(['1.3.16'])
    const a = await makeVersion('1.3.17')
    const b = await makeVersion('1.3.18')

    await Promise.all([
      startResult(a.id, { maxActive: CAP }),
      startResult(b.id, { maxActive: CAP }),
    ])

    const active = await activeCountFor(fx.users.editor.id)
    expect(active, 'at most one over the cap').toBeLessThanOrEqual(CAP + 1)
    expect(active, 'and the seeded row is still there').toBeGreaterThanOrEqual(CAP)
  })
})

/** Active rows for a user, across every source — the quantity the cap is actually about. */
async function activeCountFor(userId: number) {
  const { totalDocs } = await fx.payload.count({
    collection: 'edit-recovery',
    where: { and: [{ user: { equals: userId } }, { retiredAt: { exists: false } }] },
    overrideAccess: true,
  })
  return totalDocs
}
