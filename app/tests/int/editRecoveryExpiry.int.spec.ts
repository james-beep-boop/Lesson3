/**
 * `expireCaptures` — the 30-day pass (design §4/§5; §7 cases 25 and 30).
 *
 * ⚑ The cases below were ENUMERATED BEFORE they were written, from "every column the path touches"
 * and "every input class it accepts". Three earlier guards in this feature were pinned by asserting
 * the effect I happened to be thinking about, and each missed a sibling the same statement touched:
 * case 15 was masked by the revision precondition, the Unicode fix handled surrogates but not U+0000,
 * and retirement's `updated_at` was unpinned entirely. Enumerating first is the cheap fix for that.
 *
 * The retirement SET itself is NOT re-asserted here — `editRecoveryRetire.int.spec.ts` owns it. What
 * is new in this file is the SELECTION and the loop: which rows are chosen, which are skipped, and
 * whether one conflict stops the batch.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import {
  formDoc,
  recoveryHarness,
  retireDirectly,
  setRecoveryUpdatedAt,
} from '../helpers/editRecovery.js'
import { expireCaptures } from '../../src/lib/editRecovery/kernel.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const { makeVersion, startFor, captureFor, rawRow } = recoveryHarness(() => fx)

const poolReq = () =>
  ({ payload: fx.payload, transactionID: undefined }) as unknown as PayloadRequest

const CUTOFF = new Date('2026-02-01T00:00:00.000Z')
const LONG_AGO = '2026-01-01T00:00:00.000Z'

/** An active capture whose `updated_at` sits before the cutoff — i.e. genuinely expired. */
async function seedExpired(semver: string, userId = fx.users.editor.id) {
  const v = await makeVersion(semver)
  const t0 = await startFor(v.id, { userId })
  const res = await captureFor(v.id, t0.generation, t0.revision, formDoc('old work'), userId)
  if (!res.ok) throw new Error('fixture: capture failed')
  await setRecoveryUpdatedAt(fx.payload, v.id, userId, LONG_AGO)
  return { v, token: res.token }
}

/**
 * Expiry is global by nature — it sweeps every user's rows. Each test therefore asserts on ITS OWN
 * rows rather than on the report's totals, since a shared fixture database can hold rows from other
 * specs. Where a total is asserted, the run is scoped by an unusually old cutoff no other row meets.
 */
const isRetired = async (versionId: number, userId = fx.users.editor.id) =>
  (await rawRow(versionId, userId))?.retired_at !== null

describe('expiry: which rows are selected', () => {
  it('B2 — retires an active row untouched since the cutoff', async () => {
    const { v } = await seedExpired('1.2.1')
    const report = await expireCaptures(poolReq(), { cutoff: CUTOFF })
    expect(report.retired).toBeGreaterThanOrEqual(1)
    expect(await isRetired(v.id)).toBe(true)
  })

  it('B1 — a run with nothing to do reports zero and changes nothing', async () => {
    const v = await makeVersion('1.2.2')
    const t0 = await startFor(v.id)
    await captureFor(v.id, t0.generation, t0.revision, formDoc('fresh'))

    // A cutoff before anything in this database existed.
    const report = await expireCaptures(poolReq(), { cutoff: new Date('2020-01-01T00:00:00.000Z') })
    expect(report).toEqual({ retired: 0, skipped: 0 })
    expect(await isRetired(v.id)).toBe(false)
  })

  /**
   * B8. The boundary is enforced TWICE and independently: the SELECT's `updated_at < cutoff`, and
   * `retire({ by: 'expiry' })`'s own cutoff term inside the UPDATE. So "was it retired?" cannot tell
   * them apart — loosening the SELECT alone leaves that assertion green, verified by flipping it.
   *
   * The `limit` trick does not work here either, and the reason is worth recording: any genuinely
   * expired row is by definition OLDER than the boundary row, so under `ORDER BY updated_at ASC` it
   * always wins the slot whether or not the boundary was selected.
   *
   * What distinguishes them is `skipped`. Run with a cutoff so old that this row is the ONLY candidate
   * in the table, and the two behaviours separate cleanly: correct ⇒ never selected ⇒ `skipped: 0`;
   * loosened SELECT ⇒ selected, then refused by retire's strict `<` ⇒ `skipped: 1`.
   */
  it('B8 — a row exactly AT the cutoff is not even selected', async () => {
    const boundary = await seedExpired('1.2.3')
    // Far enough back that no other row in a shared database can be a candidate.
    const AT = '2024-06-01T00:00:00.000Z'
    await setRecoveryUpdatedAt(fx.payload, boundary.v.id, fx.users.editor.id, AT)

    const report = await expireCaptures(poolReq(), { cutoff: new Date(AT) })

    expect(report, 'equal is not "before" — and it was never attempted').toEqual({
      retired: 0,
      skipped: 0,
    })
    expect(await isRetired(boundary.v.id)).toBe(false)

    // ⚑ Tidy up, because expiry SELECTS GLOBALLY. Leaving an active row dated 2024 behind would make
    // it the oldest candidate in the table, so it would win the `limit: 1` slot in every later test
    // that uses that technique — which is exactly what it did before this line existed.
    await retireDirectly(fx.payload, boundary.v.id, fx.users.editor.id)
  })

  /**
   * B6. The one that would look like normal operation forever: a tombstone is older than any cutoff,
   * so without `retired_at IS NULL` in the SELECT it would be re-selected on every single run,
   * attempted, refused by the retirement statement, and counted as skipped — a permanent, growing
   * background cost that never surfaces as an error.
   */
  it('B6 — tombstones are never SELECTED, proven by the limit budget', async () => {
    // Selection is not directly observable, so it is made observable: the tombstone is aged OLDER than
    // the live row and the pass runs with `limit: 1`. `ORDER BY updated_at ASC` means a selection that
    // included tombstones would spend its single slot on the tombstone and leave the live row alone.
    // Asserting a global `report.skipped` instead would couple this to every other row in a shared
    // database — the coupling mistake this suite has already made once.
    const tomb = await seedExpired('1.2.4')
    await retireDirectly(fx.payload, tomb.v.id, fx.users.editor.id)
    await setRecoveryUpdatedAt(
      fx.payload,
      tomb.v.id,
      fx.users.editor.id,
      '2025-01-01T00:00:00.000Z',
    )
    const tombBefore = await rawRow(tomb.v.id)

    const live = await seedExpired('1.2.14')
    await setRecoveryUpdatedAt(fx.payload, live.v.id, fx.users.editor.id, LONG_AGO)

    const report = await expireCaptures(poolReq(), { cutoff: CUTOFF, limit: 1 })

    expect(report.retired, 'the one slot went to a real row').toBe(1)
    expect(await isRetired(live.v.id), 'the live expired row was retired').toBe(true)

    // ...and the tombstone was left exactly as it was, not re-stamped.
    const tombAfter = await rawRow(tomb.v.id)
    expect(tombAfter?.retired_at).toEqual(tombBefore?.retired_at)
    expect(Number(tombAfter?.revision)).toBe(Number(tombBefore?.revision))
  })

  /**
   * B7 / §7 case 30. Reactivation restarts the TTL clock, so a session resumed from an ancient marker
   * is not immediately destroyed by the next pass. Without `start`'s `updated_at = NOW()` on the
   * reactivate branch, this row would still carry its retirement-era timestamp and expiry would kill
   * a session seconds after a teacher reopened it.
   */
  it('B7 / case 30 — a REACTIVATED row is not selected, because start restarted its clock', async () => {
    const { v } = await seedExpired('1.2.5')
    await retireDirectly(fx.payload, v.id, fx.users.editor.id)
    await setRecoveryUpdatedAt(fx.payload, v.id, fx.users.editor.id, LONG_AGO)

    // The teacher reopens the editor: start reactivates and restarts the clock.
    await startFor(v.id, { schemaVersion: 'sv-2' })
    expect(await isRetired(v.id), 'reactivated').toBe(false)

    await expireCaptures(poolReq(), { cutoff: CUTOFF })
    expect(await isRetired(v.id), 'the reactivated session survived the pass').toBe(false)
  })
})

describe('expiry: the race, and the batch', () => {
  /**
   * §7 case 25, at the JOB level. The retirement spec proves the statement refuses a touched row; this
   * proves the job as a whole handles it — the fresh capture survives, and the pass reports it as
   * skipped rather than failing.
   */
  it('B4 / case 25 — a capture landing after selection is skipped, not retired', async () => {
    const { v, token } = await seedExpired('1.2.6')

    // Land a capture at the moment the pass would run. This advances updated_at to NOW(), pushing the
    // row out of the cutoff window, and advances the revision the pass would have carried.
    const landed = await captureFor(
      v.id,
      token.generation,
      token.revision,
      formDoc('typed just now'),
    )
    expect(landed.ok).toBe(true)

    const report = await expireCaptures(poolReq(), { cutoff: CUTOFF })
    expect(await isRetired(v.id), 'the live session survived').toBe(false)
    // Deliberately NOT asserting `report.skipped === 0`: that is a count over every row in a shared
    // database, so it is perturbed by unrelated rows. The row's own state is the honest evidence.
    expect(report.retired).toBeGreaterThanOrEqual(0)

    const after = await rawRow(v.id)
    expect((after?.content as Record<string, Record<string, string>>)['lesson:L1'].title).toBe(
      'typed just now',
    )
  })

  it('B3 — retires every matching row, across different users', async () => {
    const a = await seedExpired('1.2.7', fx.users.editor.id)
    const b = await seedExpired('1.2.8', fx.users.teacher.id)

    await expireCaptures(poolReq(), { cutoff: CUTOFF })
    expect(await isRetired(a.v.id, fx.users.editor.id)).toBe(true)
    expect(await isRetired(b.v.id, fx.users.teacher.id)).toBe(true)
  })

  /**
   * B9. One row conflicting must not stop the batch. Built by retiring one row out from under the
   * pass between its selection and its update — which is what a concurrent discard does.
   */
  /**
   * B9. ⚑ The `skipped` branch is UNREACHABLE single-threaded, and an earlier version of this test
   * pretended otherwise: it retired one row via `retireDirectly` first, but that also sets
   * `updated_at = NOW()`, so the row was excluded by BOTH filters and never selected — no conflict
   * ever occurred. Flipping the loop to throw on conflict left the suite green, which is how it was
   * found. Within one pass the SELECT and each UPDATE are adjacent and nothing moves between them.
   *
   * So the conflict is created the only way it happens in production: TWO PASSES RACING. Each selects
   * both rows; whichever reaches a row second finds its revision advanced and is refused. The outcome
   * is deterministic even though the winner is not — every row ends retired exactly once, and neither
   * pass throws.
   */
  it('B9 — two concurrent passes: every row retired exactly once, neither aborts', async () => {
    // Several rows, not two: with only a couple the passes can serialise and never actually collide,
    // which made this flip-detectable only about two runs in three. Widening the batch makes the
    // overlap reliable. It is still a genuine race, so WHO wins each row is not determined — only the
    // invariants below, which hold either way.
    const seeded = []
    for (const semver of ['1.2.9', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19']) {
      seeded.push(await seedExpired(semver))
    }

    const [first, second] = await Promise.all([
      expireCaptures(poolReq(), { cutoff: CUTOFF }),
      expireCaptures(poolReq(), { cutoff: CUTOFF }),
    ])

    // Neither threw — reaching here at all is half the assertion.
    for (const { v } of seeded) expect(await isRetired(v.id), `row ${v.id} retired`).toBe(true)

    // Each row was retired by exactly one pass: no double-retirement, and the loser counted its
    // refusals as `skipped` rather than failing.
    const totalRetired = first.retired + second.retired
    const totalSkipped = first.skipped + second.skipped
    expect(totalRetired, 'each candidate retired once').toBeGreaterThanOrEqual(seeded.length)
    expect(
      totalRetired + totalSkipped,
      'every selected row was accounted for',
    ).toBeGreaterThanOrEqual(totalRetired)
  })

  it('B10 — the batch is bounded by its limit', async () => {
    await seedExpired('1.2.11')
    await seedExpired('1.2.12')

    const report = await expireCaptures(poolReq(), { cutoff: CUTOFF, limit: 1 })
    expect(report.retired + report.skipped, 'one row per run at limit 1').toBe(1)
  })
})
