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
import {
  expireCaptures,
  retireSelected,
  selectExpiredCaptures,
  type ExpiryCandidate,
} from '../../src/lib/editRecovery/kernel.js'

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
  /**
   * B4 / §7 case 25, at the JOB level and now genuinely interleaved.
   *
   * ⚑ An earlier version of this test awaited the capture BEFORE calling `expireCaptures`, so the row
   * was excluded by the initial SELECT and nothing ever "landed after selection" — the claim in its
   * own name was false. Selection and retirement are split precisely so this can be exercised: select
   * first, land the capture, then retire the candidates the pass had already chosen.
   */
  it('B4 / case 25 — a capture landing AFTER selection is skipped, not retired', async () => {
    const { v, token } = await seedExpired('1.2.6')

    // The pass selects it: active, and untouched since the cutoff.
    const candidates = await selectExpiredCaptures(poolReq(), { cutoff: CUTOFF })
    expect(
      candidates.some((c) => c.sourceVersionId === v.id),
      'selected as expired',
    ).toBe(true)

    // ...and only THEN does the teacher type. `updated_at` moves to NOW() and the revision advances,
    // so the candidate the pass is holding is now stale in both terms.
    const landed = await captureFor(
      v.id,
      token.generation,
      token.revision,
      formDoc('typed just now'),
    )
    expect(landed.ok).toBe(true)

    const report = await retireSelected(poolReq(), candidates, CUTOFF)

    expect(report.skipped, 'the stale candidate was refused').toBeGreaterThanOrEqual(1)
    expect(await isRetired(v.id), 'the live session survived the pass').toBe(false)
    const after = await rawRow(v.id)
    expect((after?.content as Record<string, Record<string, string>>)['lesson:L1'].title).toBe(
      'typed just now',
    )
  })

  /**
   * B5 — the enumerated class that had NO test. Another caller (a discard, a save-as-new) retires the
   * row between this pass's selection and its update. Distinct from B4: there the revision moved, here
   * the row is already a tombstone, so it is `retired_at IS NULL` that refuses it.
   */
  it('B5 — a row retired by someone else after selection is skipped', async () => {
    const { v } = await seedExpired('1.2.20')

    const candidates = await selectExpiredCaptures(poolReq(), { cutoff: CUTOFF })
    const mine = candidates.filter((c) => c.sourceVersionId === v.id)
    expect(mine, 'selected as expired').toHaveLength(1)

    await retireDirectly(fx.payload, v.id, fx.users.editor.id)
    const afterOther = await rawRow(v.id)

    const report = await retireSelected(poolReq(), mine, CUTOFF)

    expect(report, 'refused, not re-stamped').toEqual({ retired: 0, skipped: 1 })
    const after = await rawRow(v.id)
    expect(after?.retired_at, "the other caller's marker is untouched").toEqual(
      afterOther?.retired_at,
    )
    expect(Number(after?.revision)).toBe(Number(afterOther?.revision))
  })

  it('B3 — retires every matching row, across different users', async () => {
    const a = await seedExpired('1.2.7', fx.users.editor.id)
    const b = await seedExpired('1.2.8', fx.users.teacher.id)

    await expireCaptures(poolReq(), { cutoff: CUTOFF })
    expect(await isRetired(a.v.id, fx.users.editor.id)).toBe(true)
    expect(await isRetired(b.v.id, fx.users.teacher.id)).toBe(true)
  })

  /**
   * B9 — continue-on-conflict, made DETERMINISTIC.
   *
   * ⚑ Two earlier versions of this test were wrong in different ways. The first created no conflict at
   * all (it retired a row via `retireDirectly` first, which also sets `updated_at = NOW()`, so the row
   * was excluded by both filters and never selected). The second raced two concurrent passes, which
   * worked only probabilistically — six rows made a flip detectable 3 runs in 3, but that is evidence
   * about likelihood, not a guarantee, and the assertions did not even require a conflict to have
   * happened (`totalRetired + totalSkipped >= totalRetired` is tautological).
   *
   * With selection split from retirement there is no need to race anything: take TWO selections of the
   * same rows, retire with the first, then retire with the second. Every candidate the second holds is
   * now stale by construction, so it must skip all of them and must not throw.
   */
  it('B9 — a pass whose candidates are all stale skips them all and does not abort', async () => {
    const rows: Awaited<ReturnType<typeof seedExpired>>[] = []
    for (const semver of ['1.2.9', '1.2.15', '1.2.16']) rows.push(await seedExpired(semver))
    const mineOf = (cs: ExpiryCandidate[]) =>
      cs.filter((c) => rows.some((r) => r.v.id === c.sourceVersionId))

    const firstPass = mineOf(await selectExpiredCaptures(poolReq(), { cutoff: CUTOFF }))
    const secondPass = mineOf(await selectExpiredCaptures(poolReq(), { cutoff: CUTOFF }))
    expect(firstPass).toHaveLength(rows.length)
    expect(secondPass).toHaveLength(rows.length)

    const winner = await retireSelected(poolReq(), firstPass, CUTOFF)
    expect(winner).toEqual({ retired: rows.length, skipped: 0 })

    // Every candidate is stale now. The pass must count them all and reach the end.
    const loser = await retireSelected(poolReq(), secondPass, CUTOFF)
    expect(loser, 'all skipped, none retired, nothing thrown').toEqual({
      retired: 0,
      skipped: rows.length,
    })

    // And the rows are retired exactly once — no double-stamping.
    for (const { v } of rows) expect(await isRetired(v.id), `row ${v.id}`).toBe(true)
  })

  it('B10 — the batch is bounded by its limit', async () => {
    await seedExpired('1.2.11')
    await seedExpired('1.2.12')

    const report = await expireCaptures(poolReq(), { cutoff: CUTOFF, limit: 1 })
    expect(report.retired + report.skipped, 'one row per run at limit 1').toBe(1)
  })
})
