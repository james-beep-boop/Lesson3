/**
 * `start` — the fencing kernel's insert/reactivate statement (design §4; §7 cases 21-22).
 *
 * These are CONCURRENCY tests, so they are worth only as much as their concurrency is real. Each pair
 * of callers runs on its own pooled connection (no `transactionID`, so `txDb` falls back to the pool)
 * and is fired with `Promise.all`, which is what makes Postgres actually serialise them on the row and
 * lets `ON CONFLICT DO UPDATE` re-evaluate against the newly committed row. Two sequential calls would
 * pass these assertions while proving nothing about the race they exist for.
 *
 * The governing rule under test: **`start` on an already-active row is a total no-op that reports
 * state.** It fires on every Edit click and in every tab. Any mutation on the resume path is a write,
 * and a write invalidates the preconditions other tabs are holding — which is precisely how an earlier
 * draft of this SQL broke both cases below by bumping `revision` unconditionally.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import {
  ageRecoveryRow,
  recoveryHarness,
  retireDirectly,
  setRecoveryContent,
  setRecoveryUpdatedAt,
} from '../helpers/editRecovery.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

/** A request with NO transaction, so each concurrent caller gets its own pooled connection. */
const { makeVersion, startFor, rawRow, countRows } = recoveryHarness(() => fx)

describe('start: first call', () => {
  it('inserts one active row at generation 1, revision 1, with the caller-derived baseline', async () => {
    const v = await makeVersion('1.0.201')
    const token = await startFor(v.id)
    expect(token).toMatchObject({ generation: 1, revision: 1 })
    expect(typeof token.updatedAt).toBe('string')

    const row = await rawRow(v.id)
    expect(row?.retired_at).toBeNull()
    expect(row?.schema_version).toBe('sv-1')
    // Derived server-side from the source, never from the client.
    expect(new Date(String(row?.base_updated_at)).toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('start: resume is a total no-op (§4 governing rule)', () => {
  it('returns the same generation, revision AND updated_at on an active row', async () => {
    const v = await makeVersion('1.0.202')
    const first = await startFor(v.id)
    const before = await rawRow(v.id)

    const second = await startFor(v.id, { schemaVersion: 'sv-DIFFERENT' })
    const after = await rawRow(v.id)

    expect(second).toEqual(first)
    // Nothing was written: not the revision, not the TTL clock, not the baseline metadata. A resume
    // that touched `updated_at` would restart the 30-day clock on every Edit click, so a capture
    // could never expire while anyone kept opening the editor.
    expect(after?.updated_at).toEqual(before?.updated_at)
    expect(after?.schema_version).toBe('sv-1')
    expect(after?.base_updated_at).toEqual(before?.base_updated_at)
    expect(await countRows(v.id)).toBe(1)
  })
})

describe('start: reactivation establishes a fresh session defensively', () => {
  /**
   * Retirement clears `content`, so in the happy path a marker has none to inherit. This proves
   * `start` does not DEPEND on that: given a deliberately malformed marker — retired but with content
   * still present — reactivation must still hand the new session an empty one. The failure guarded
   * against is a teacher opening the editor and being offered the previous session's text as
   * recoverable work, which is not a failure worth leaving to another function's correctness.
   */
  it('clears content when reactivating, even from a marker that wrongly still has some', async () => {
    const v = await makeVersion('1.0.205')
    await startFor(v.id)
    await retireDirectly(fx.payload, v.id, fx.users.editor.id)

    // Malformed on purpose: retired, but content left behind. Fixture SQL goes through the shared
    // helper (which uses `drizzleOf`), not through production `txDb` — routing setup through the code
    // under test would couple it to `txDb`'s own branches.
    await setRecoveryContent(fx.payload, v.id, fx.users.editor.id, {
      'lesson:1': { title: 'STALE' },
    })
    expect((await rawRow(v.id))?.content).not.toBeNull()

    await startFor(v.id, { schemaVersion: 'sv-3' })

    const row = await rawRow(v.id)
    expect(row?.retired_at).toBeNull()
    expect(row?.content, 'a reactivated session must not inherit content').toBeNull()
  })

  it('preserves content on RESUME, because resume is a no-op', async () => {
    const v = await makeVersion('1.0.206')
    const t0 = await startFor(v.id)
    await setRecoveryContent(fx.payload, v.id, fx.users.editor.id, {
      'lesson:1': { title: 'live work' },
    })

    const again = await startFor(v.id)
    expect(again).toEqual(t0)
    const row = await rawRow(v.id)
    expect((row?.content as Record<string, Record<string, string>>)['lesson:1'].title).toBe(
      'live work',
    )
  })
})

describe('start: the token matches the stored instant exactly', () => {
  /**
   * ⚑ Scope of this test, stated because it is narrower than it looks. It pins that the token's
   * `updatedAt` equals what is actually in the column, to the millisecond. It does NOT exercise
   * `tokenOf`'s `Date` branch: drizzle's pool returns `timestamptz` as a STRING, so the branch that
   * would truncate (`String(aDate)`, which renders no milliseconds) is unreachable here. Deleting
   * that branch would leave this test green — it is defence against a driver-configuration change,
   * not a live fix, and pretending otherwise would be the false-coverage failure this suite keeps
   * finding in itself.
   */
  it('reports a pinned sub-second updated_at exactly', async () => {
    const v = await makeVersion('1.0.207')
    await startFor(v.id)

    // Pinned rather than compared against `NOW()`: `NOW()` lands on `.000` roughly once in a
    // thousand runs, so comparing two values that were both produced by it proves nothing about
    // sub-second preservation on the runs where it matters. `.807` is non-zero by construction.
    const PINNED = '2026-08-06T01:14:12.807Z'
    await setRecoveryUpdatedAt(fx.payload, v.id, fx.users.editor.id, PINNED)

    // Resume is a no-op, so it reports the pinned instant rather than writing a new one.
    const token = await startFor(v.id)
    expect(token.updatedAt).toBe(PINNED)
  })
})

describe('start: case 21 — two simultaneous FIRST starts', () => {
  it('creates one row, hands both callers the SAME token, and neither errors on the unique index', async () => {
    const v = await makeVersion('1.0.203')
    const [a, b] = await Promise.all([startFor(v.id), startFor(v.id)])

    expect(await countRows(v.id)).toBe(1)
    // Identical, not merely both-present. The loser must read exactly the winner's values — a token
    // that had already moved on would make its holder's first capture 409 against a conflict it
    // caused itself, which is the bug the unconditional revision bump produced ((1,1) and (1,2)).
    expect(a).toEqual(b)
    expect(a).toMatchObject({ generation: 1, revision: 1 })

    const row = await rawRow(v.id)
    expect(row?.retired_at).toBeNull()
  })
})

describe('start: case 22 — two simultaneous starts against a RETIRED row', () => {
  it('advances the generation EXACTLY once and hands both callers the same advanced pair', async () => {
    const v = await makeVersion('1.0.204')
    const first = await startFor(v.id)
    expect(first).toMatchObject({ generation: 1, revision: 1 })

    await retireDirectly(fx.payload, v.id, fx.users.editor.id)
    // Age it, so "the TTL clock restarted" is a claim the assertion can actually fail. Comparing
    // against an unaged row admits equality, and `updated_at = NOW()` could be deleted from the
    // reactivation branch with this test still green.
    await ageRecoveryRow(fx.payload, v.id, fx.users.editor.id, 60)
    const retired = await rawRow(v.id)
    expect(retired?.retired_at).not.toBeNull()
    const retiredRevision = Number(retired?.revision)

    const [a, b] = await Promise.all([
      startFor(v.id, { schemaVersion: 'sv-2' }),
      startFor(v.id, { schemaVersion: 'sv-2' }),
    ])

    expect(await countRows(v.id)).toBe(1)
    expect(a).toEqual(b)
    // Exactly once: the second caller takes the now-ACTIVE branch, because ON CONFLICT DO UPDATE
    // re-evaluates against the newly committed row. Advancing twice would fence out the tab that just
    // reactivated — the caller's own token would already be stale.
    expect(a.generation).toBe(2)
    expect(a.revision).toBe(retiredRevision + 1)

    const row = await rawRow(v.id)
    expect(row?.retired_at).toBeNull()
    // A reactivated session needs its OWN baseline and shape, or it compares staleness against the
    // retired session's and restores under a field shape that may have changed.
    expect(row?.schema_version).toBe('sv-2')
    // And the TTL clock restarted, STRICTLY — or the next expiry run would destroy the session
    // seconds after it began.
    expect(new Date(String(row?.updated_at)).getTime()).toBeGreaterThan(
      new Date(String(retired?.updated_at)).getTime(),
    )
    // The retired generation stays fenced: nothing holding generation 1 can act on this row again.
    expect(a.generation).toBeGreaterThan(1)
  })
})
