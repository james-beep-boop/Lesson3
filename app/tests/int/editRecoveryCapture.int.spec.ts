/**
 * `capture` — the compare-and-set UPDATE (design §2/§4; §7 case 15).
 *
 * The load-bearing assertions here are the ones proving capture **never inserts**. That rule is NOT
 * enforced by the compound unique index — the index only enforces one row per (user, sourceVersion)
 * and gives `start` its conflict target, so a capture inserting where no row existed would satisfy it
 * perfectly. Two tests therefore attack it directly: a capture with no row at all, and a capture
 * against a retired row (case 15, resurrection). Both must leave the table exactly as they found it.
 *
 * `start` is used to establish state rather than raw SQL, so these exercise the real pairing a client
 * performs; retirement is still done directly, the shared retirement function being a later commit.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import type { PayloadRequest } from 'payload'

import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import { capture, MAX_CAPTURE_BYTES, start, txDb } from '../../src/lib/editRecovery/kernel.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const poolReq = () =>
  ({ payload: fx.payload, transactionID: undefined }) as unknown as PayloadRequest

async function makeVersion(semver: string) {
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      sourceVersion: fx.version.id,
      title: `${MARK}Cap-${semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })
}

const startFor = (versionId: number, userId = fx.users.editor.id) =>
  start(poolReq(), {
    userId,
    sourceVersionId: versionId,
    lessonPlanId: fx.plan.id,
    sourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    schemaVersion: 'sv-1',
  })

const captureFor = (
  versionId: number,
  generation: number,
  expectedRevision: number,
  content: unknown,
  userId = fx.users.editor.id,
) =>
  capture(poolReq(), { userId, sourceVersionId: versionId, generation, expectedRevision, content })

const rows = (res: unknown) => {
  const r = res as { rows?: Record<string, unknown>[] } | Record<string, unknown>[]
  return Array.isArray(r) ? r : (r?.rows ?? [])
}

async function rawRow(versionId: number, userId = fx.users.editor.id) {
  const db = await txDb(poolReq())
  return rows(
    await db.execute(sql`
      SELECT generation, revision, retired_at, content, updated_at FROM edit_recovery
      WHERE user_id = ${userId} AND source_version_id = ${versionId}
    `),
  )[0]
}

async function countRows(versionId: number, userId = fx.users.editor.id) {
  const db = await txDb(poolReq())
  return Number(
    rows(
      await db.execute(sql`
        SELECT COUNT(*)::int AS n FROM edit_recovery
        WHERE user_id = ${userId} AND source_version_id = ${versionId}
      `),
    )[0]?.n,
  )
}

async function retireDirectly(versionId: number, userId = fx.users.editor.id) {
  const db = await txDb(poolReq())
  await db.execute(sql`
    UPDATE edit_recovery SET retired_at = NOW(), content = NULL,
      revision = revision + 1, updated_at = NOW()
    WHERE user_id = ${userId} AND source_version_id = ${versionId}
  `)
}

describe('capture: the happy path advances the row and returns the NEW token', () => {
  it('stores content, bumps revision by one, and restarts the TTL clock', async () => {
    const v = await makeVersion('1.0.301')
    const t0 = await startFor(v.id)
    const before = await rawRow(v.id)

    const res = await captureFor(v.id, t0.generation, t0.revision, {
      'lesson:1': { title: `${MARK}unsaved` },
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    // The ADVANCED token, not the one sent — a client left holding its sent token would 409 on its
    // next capture against a conflict it caused itself (§4's token rule).
    expect(res.token.revision).toBe(t0.revision + 1)
    expect(res.token.generation).toBe(t0.generation)

    const after = await rawRow(v.id)
    expect((after?.content as Record<string, unknown>)['lesson:1']).toEqual({
      title: `${MARK}unsaved`,
    })
    expect(new Date(String(after?.updated_at)).getTime()).toBeGreaterThanOrEqual(
      new Date(String(before?.updated_at)).getTime(),
    )
  })

  it('chains: each capture uses the token the previous call returned, with no self-inflicted 409', async () => {
    const v = await makeVersion('1.0.302')
    let token = await startFor(v.id)
    for (let i = 0; i < 3; i += 1) {
      const res = await captureFor(v.id, token.generation, token.revision, {
        'lesson:1': { title: `t${i}` },
      })
      expect(res.ok, `capture ${i} must succeed`).toBe(true)
      if (!res.ok) return
      token = res.token
    }
    expect(token.revision).toBe(4)
    expect(await countRows(v.id)).toBe(1)
  })
})

describe('capture NEVER inserts — the rule the unique index does not enforce', () => {
  it('conflicts when NO row exists, and creates nothing', async () => {
    const v = await makeVersion('1.0.303')
    expect(await countRows(v.id)).toBe(0)

    const res = await captureFor(v.id, 1, 1, { 'lesson:1': { title: 'ghost' } })
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    // The whole point: a capture without a start must not become the start.
    expect(await countRows(v.id)).toBe(0)
  })

  it('case 15 — a capture carrying a RETIRED generation conflicts and creates no new row', async () => {
    const v = await makeVersion('1.0.304')
    const t0 = await startFor(v.id)
    await retireDirectly(v.id)
    const retired = await rawRow(v.id)

    // The tab still holds the pre-retirement token and tries to save its work.
    const res = await captureFor(v.id, t0.generation, t0.revision, {
      'lesson:1': { title: 'resurrect' },
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })

    // Resurrection blocked in both possible shapes: no second row beside the marker, and the marker
    // itself untouched with its content still cleared.
    expect(await countRows(v.id)).toBe(1)
    const after = await rawRow(v.id)
    expect(after?.retired_at).not.toBeNull()
    expect(after?.content).toBeNull()
    expect(after?.revision).toEqual(retired?.revision)
  })

  /**
   * ⚑ ISOLATES `retired_at IS NULL`. The test above does NOT: retirement bumps the revision, so the
   * REVISION precondition rejects that capture and the retirement guard is never consulted. Removing
   * `AND retired_at IS NULL` from the statement left all seven tests passing — the guard could have
   * been deleted with the suite green, which is the whole failure class this file is written against.
   *
   * So this one sends the retired row's OWN current generation and revision. Every other precondition
   * matches by construction, leaving the retirement guard as the only thing that can refuse it. That
   * is also the realistic shape of a resurrection: whatever the client knows, it can read a token that
   * matches the marker.
   */
  it('case 15, isolated — a capture matching the retired row EXACTLY is still refused', async () => {
    const v = await makeVersion('1.0.308')
    await startFor(v.id)
    await retireDirectly(v.id)
    const retired = await rawRow(v.id)

    const res = await captureFor(v.id, Number(retired?.generation), Number(retired?.revision), {
      'lesson:1': { title: 'resurrect-exact' },
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })

    expect(await countRows(v.id)).toBe(1)
    const after = await rawRow(v.id)
    expect(after?.retired_at).not.toBeNull()
    expect(after?.content).toBeNull()
    expect(after?.revision).toEqual(retired?.revision)
  })
})

describe('capture: the fencing preconditions', () => {
  it('conflicts on a STALE revision and leaves the stored content untouched', async () => {
    const v = await makeVersion('1.0.305')
    const t0 = await startFor(v.id)
    const first = await captureFor(v.id, t0.generation, t0.revision, {
      'lesson:1': { title: 'winner' },
    })
    expect(first.ok).toBe(true)

    // A second tab still holding the pre-capture revision — the "another tab has newer work" case.
    const loser = await captureFor(v.id, t0.generation, t0.revision, {
      'lesson:1': { title: 'loser' },
    })
    expect(loser).toEqual({ ok: false, reason: 'conflict' })

    const after = await rawRow(v.id)
    expect((after?.content as Record<string, Record<string, string>>)['lesson:1'].title).toBe(
      'winner',
    )
  })

  it('conflicts on a stale GENERATION even when the revision matches', async () => {
    const v = await makeVersion('1.0.306')
    const t0 = await startFor(v.id)
    await retireDirectly(v.id)
    const reactivated = await startFor(v.id) // generation advances
    expect(reactivated.generation).toBeGreaterThan(t0.generation)

    // Revision is deliberately correct here, so only the generation term can reject this.
    const res = await captureFor(v.id, t0.generation, reactivated.revision, {
      'lesson:1': { title: 'stale gen' },
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect((await rawRow(v.id))?.content).toBeNull()
  })
})

describe('capture: the hard byte ceiling', () => {
  it('refuses an oversized capture without touching the row, and says so distinctly', async () => {
    const v = await makeVersion('1.0.307')
    const t0 = await startFor(v.id)
    const before = await rawRow(v.id)

    const huge = { 'lesson:1': { title: 'x'.repeat(MAX_CAPTURE_BYTES + 1) } }
    const res = await captureFor(v.id, t0.generation, t0.revision, huge)
    expect(res.ok).toBe(false)
    if (res.ok) return
    // Distinct from 'conflict': a client must not retry an oversized capture forever, which is the
    // failure a bare null return would invite.
    expect(res.reason).toBe('too-large')
    // Narrowed on the discriminant, which is the point of the union: a caller cannot reach `bytes`
    // without having established it is looking at the oversized case.
    if (res.reason !== 'too-large') return
    expect(res.bytes).toBeGreaterThan(MAX_CAPTURE_BYTES)

    const after = await rawRow(v.id)
    expect(after?.content).toBeNull()
    expect(after?.revision).toEqual(before?.revision)
  })
})
