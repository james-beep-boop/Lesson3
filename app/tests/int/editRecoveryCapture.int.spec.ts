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
import type { PayloadRequest } from 'payload'

import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import {
  ageRecoveryRow,
  countRecoveryRows,
  makeRecoveryVersion,
  recoveryRow,
  retireDirectly,
} from '../helpers/editRecovery.js'
import { capture, MAX_CAPTURE_BYTES, start } from '../../src/lib/editRecovery/kernel.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const poolReq = () =>
  ({ payload: fx.payload, transactionID: undefined }) as unknown as PayloadRequest

const makeVersion = (semver: string) =>
  makeRecoveryVersion(fx.payload, {
    planId: fx.plan.id,
    subjectGradeId: fx.subjectGrade.id,
    sourceVersionId: fx.version.id,
    semver,
  })

const startFor = (versionId: number, userId = fx.users.editor.id) =>
  start(poolReq(), {
    userId,
    sourceVersionId: versionId,
    lessonPlanId: fx.plan.id,
    sourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    schemaVersion: 'sv-1',
  })

/**
 * Note the argument is a FORM DOCUMENT, not a capture map: `capture` projects internally, so these
 * tests exercise the same boundary the endpoint will.
 */
const captureFor = (
  versionId: number,
  generation: number,
  expectedRevision: number,
  formDocument: unknown,
  userId = fx.users.editor.id,
) =>
  capture(poolReq(), {
    userId,
    sourceVersionId: versionId,
    generation,
    expectedRevision,
    formDocument,
  })

/** A form document whose lesson row carries both prose and admin/system fields. */
const formDoc = (title: string, extra: Record<string, unknown> = {}) => ({
  lessons: [{ id: 'L1', title, ...extra }],
})

const rawRow = (versionId: number, userId = fx.users.editor.id) =>
  recoveryRow(fx.payload, versionId, userId)
const countRows = (versionId: number, userId = fx.users.editor.id) =>
  countRecoveryRows(fx.payload, versionId, userId)

describe('capture: the happy path advances the row and returns the NEW token', () => {
  it('stores content, bumps revision by one, and restarts the TTL clock', async () => {
    const v = await makeVersion('1.0.301')
    const t0 = await startFor(v.id)
    // Age the row FIRST. With `>=` against an unaged row the assertion passes even if
    // `updated_at = NOW()` is deleted from the statement, since the two timestamps are equal — the
    // TTL guarantee would then be untested while looking tested.
    await ageRecoveryRow(fx.payload, v.id, fx.users.editor.id, 60)
    const before = await rawRow(v.id)

    const res = await captureFor(v.id, t0.generation, t0.revision, formDoc(`${MARK}unsaved`))
    expect(res.ok).toBe(true)
    if (!res.ok) return

    // The ADVANCED token, not the one sent — a client left holding its sent token would 409 on its
    // next capture against a conflict it caused itself (§4's token rule).
    expect(res.token.revision).toBe(t0.revision + 1)
    expect(res.token.generation).toBe(t0.generation)

    const after = await rawRow(v.id)
    expect((after?.content as Record<string, unknown>)['lesson:L1']).toEqual({
      title: `${MARK}unsaved`,
    })
    // STRICTLY greater: the write restarted the 30-day clock, or expiry would destroy a session
    // that is being actively typed into.
    expect(new Date(String(after?.updated_at)).getTime()).toBeGreaterThan(
      new Date(String(before?.updated_at)).getTime(),
    )
  })

  it('chains: each capture uses the token the previous call returned, with no self-inflicted 409', async () => {
    const v = await makeVersion('1.0.302')
    let token = await startFor(v.id)
    for (let i = 0; i < 3; i += 1) {
      const res = await captureFor(v.id, token.generation, token.revision, formDoc(`t${i}`))
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

    const res = await captureFor(v.id, 1, 1, formDoc('ghost'))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    // The whole point: a capture without a start must not become the start.
    expect(await countRows(v.id)).toBe(0)
  })

  it('case 15 — a capture carrying a RETIRED generation conflicts and creates no new row', async () => {
    const v = await makeVersion('1.0.304')
    const t0 = await startFor(v.id)
    await retireDirectly(fx.payload, v.id, fx.users.editor.id)
    const retired = await rawRow(v.id)

    // The tab still holds the pre-retirement token and tries to save its work.
    const res = await captureFor(v.id, t0.generation, t0.revision, formDoc('resurrect'))
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
    await retireDirectly(fx.payload, v.id, fx.users.editor.id)
    const retired = await rawRow(v.id)

    const res = await captureFor(
      v.id,
      Number(retired?.generation),
      Number(retired?.revision),
      formDoc('resurrect-exact'),
    )
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
    const first = await captureFor(v.id, t0.generation, t0.revision, formDoc('winner'))
    expect(first.ok).toBe(true)

    // A second tab still holding the pre-capture revision — the "another tab has newer work" case.
    const loser = await captureFor(v.id, t0.generation, t0.revision, formDoc('loser'))
    expect(loser).toEqual({ ok: false, reason: 'conflict' })

    const after = await rawRow(v.id)
    expect((after?.content as Record<string, Record<string, string>>)['lesson:L1'].title).toBe(
      'winner',
    )
  })

  it('conflicts on a stale GENERATION even when the revision matches', async () => {
    const v = await makeVersion('1.0.306')
    const t0 = await startFor(v.id)
    await retireDirectly(fx.payload, v.id, fx.users.editor.id)
    const reactivated = await startFor(v.id) // generation advances
    expect(reactivated.generation).toBeGreaterThan(t0.generation)

    // Revision is deliberately correct here, so only the generation term can reject this.
    const res = await captureFor(v.id, t0.generation, reactivated.revision, formDoc('stale gen'))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect((await rawRow(v.id))?.content).toBeNull()
  })
})

/**
 * The PROJECTION boundary, asserted at the column rather than in a unit test. The unit suite proves
 * `projectCapture` excludes admin fields; this proves `capture` actually calls it, which is a
 * different claim. An earlier signature took a pre-projected map and stored it verbatim, so the
 * whitelist was a convention every caller had to remember — and a convention is not a boundary.
 */
describe('capture: the projection boundary reaches the column', () => {
  it('stores prose only — hostile admin/system fields never reach `content`', async () => {
    const v = await makeVersion('1.0.309')
    const t0 = await startFor(v.id)

    const hostile = {
      lessons: [
        {
          id: 'L1',
          title: 'prose survives',
          // Every one of these is admin/system and must be absent from the stored row.
          resourceLinks: [{ id: 'R1', url: 'https://evil.example/HOSTILE' }],
          number: 'HOSTILE-number',
          duration: 'HOSTILE-duration',
          framework: [{ id: 'F1', teacherMoves: 'fw prose survives', phase: 'HOSTILE-phase' }],
        },
      ],
      meta: { subject: 'HOSTILE-meta' },
      semver: 'HOSTILE-semver',
      finalExplanation: {
        instructions: 'fe prose survives',
        sections: [{ id: 'S1', prompt: 'section prose survives', exemplar: 'HOSTILE-exemplar' }],
        rubric: [{ id: 'RB1', criterion: 'HOSTILE-rubric' }],
      },
    }

    const res = await captureFor(v.id, t0.generation, t0.revision, hostile)
    expect(res.ok).toBe(true)

    const stored = JSON.stringify((await rawRow(v.id))?.content)
    // By value, so a leak into a container this test did not think to name is still caught.
    expect(stored).not.toContain('HOSTILE')
    expect(stored).not.toContain('evil.example')
    // ...and the prose genuinely did survive, or the assertion above would be satisfied by an
    // empty capture.
    expect(stored).toContain('prose survives')
    expect(stored).toContain('fw prose survives')
    expect(stored).toContain('section prose survives')
  })
})

/**
 * `txDb` must FAIL CLOSED. A `transactionID` whose drizzle session cannot be resolved means the
 * statement would silently run on the pool — committing independently of the transaction the caller
 * believes it is inside. On the retirement path that is a capture destroyed for a save that then
 * rolled back, which is the exact work-loss this feature exists to prevent.
 */
describe('capture: an unresolvable transaction is refused, not downgraded to the pool', () => {
  it('throws and leaves the row untouched when the transactionID has no session', async () => {
    const v = await makeVersion('1.0.310')
    const t0 = await startFor(v.id)
    const before = await rawRow(v.id)

    const bogusReq = {
      payload: fx.payload,
      transactionID: 'no-such-transaction-id',
    } as unknown as PayloadRequest

    await expect(
      capture(bogusReq, {
        userId: fx.users.editor.id,
        sourceVersionId: v.id,
        generation: t0.generation,
        expectedRevision: t0.revision,
        formDocument: formDoc('should never land'),
      }),
    ).rejects.toThrow(/no drizzle session/)

    const after = await rawRow(v.id)
    expect(after?.content).toBeNull()
    expect(after?.revision).toEqual(before?.revision)
    expect(after?.updated_at).toEqual(before?.updated_at)
  })
})

describe('capture: the hard byte ceiling', () => {
  it('refuses an oversized capture without touching the row, and says so distinctly', async () => {
    const v = await makeVersion('1.0.307')
    const t0 = await startFor(v.id)
    const before = await rawRow(v.id)

    // MULTIBYTE on purpose. '\u{1F600}' is 4 UTF-8 bytes but JS `.length` 2, so this document is
    // ~524 KB of UTF-8 while its character count is only ~262 K — well under the ceiling. An ASCII
    // payload would pass this test even if `Buffer.byteLength` were replaced by `.length`, leaving
    // the real limit unenforced for exactly the content most likely to be large: prose with
    // accents, curly quotes or any non-Latin script.
    const emojiCount = Math.ceil(MAX_CAPTURE_BYTES / 4) + 2
    const huge = formDoc('\u{1F600}'.repeat(emojiCount))
    expect(JSON.stringify(huge).length).toBeLessThan(MAX_CAPTURE_BYTES)
    expect(Buffer.byteLength(JSON.stringify(huge), 'utf8')).toBeGreaterThan(MAX_CAPTURE_BYTES)

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
