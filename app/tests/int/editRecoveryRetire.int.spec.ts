/**
 * `retire` — the one shared retirement transition (design §4; §7 cases 23-25).
 *
 * Four callers, one `SET`, and the point of the suite is that they really do share it: each caller's
 * happy path is asserted to produce the SAME row state, so a future edit that special-cases one of
 * them shows up here rather than in production.
 *
 * ⚑ Cases 19-20 are deliberately NOT here. They are save-as-new cases — "retirement fails during
 * save-as-new ⇒ the whole save rolls back" and the concurrent save-plus-capture race — and they say
 * nothing unless driven through the real `endpoints/versionEdit.ts` transaction and its semver-retry
 * loop. A mocked throw would prove the mock. They belong with the endpoint work.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { commitTransaction, initTransaction, killTransaction, type PayloadRequest } from 'payload'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { formDoc, recoveryHarness, setRecoveryUpdatedAt } from '../helpers/editRecovery.js'
import { retire, type RetireCommand } from '../../src/lib/editRecovery/kernel.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const { poolReq, makeVersion, startFor, captureFor, rawRow, countRows } = recoveryHarness(() => fx)

const retireFor = (versionId: number, command: RetireCommand, userId = fx.users.editor.id) =>
  retire(poolReq(), { userId, sourceVersionId: versionId }, command)

/**
 * Run `fn` inside a REAL Payload transaction, so `save-as-new` can be tested as itself rather than
 * through a look-alike command. `commit: false` rolls back instead — which is how case 19's shape is
 * exercised without mocking a throw.
 */
async function inTransaction<T>(
  fn: (req: PayloadRequest) => Promise<T>,
  commit = true,
): Promise<T> {
  const req = { payload: fx.payload } as unknown as PayloadRequest
  await initTransaction(req)
  try {
    const out = await fn(req)
    if (commit) await commitTransaction(req)
    else await killTransaction(req)
    return out
  } catch (err) {
    await killTransaction(req)
    throw err
  }
}

/** Start, capture once, and hand back the live token — the state every caller retires FROM. */
async function seedActiveCapture(semver: string) {
  const v = await makeVersion(semver)
  const t0 = await startFor(v.id)
  const res = await captureFor(v.id, t0.generation, t0.revision, formDoc('unsaved work'))
  if (!res.ok) throw new Error('fixture: capture failed')
  return { v, token: res.token }
}

/**
 * The one post-retirement assertion, shared by every caller's happy path — which is what makes "all
 * four share ONE transition" true by construction rather than by several lists staying in sync. An
 * earlier version wrote it out twice, and the two copies had already drifted: the save-as-new one had
 * silently dropped the marker-kept and token-echo checks, so the fourth caller was verified less
 * thoroughly than the other three and nothing said so.
 */
async function expectRetired(
  versionId: number,
  before: Record<string, unknown> | undefined,
  token: { generation: number; revision: number },
  label: string,
) {
  const after = await rawRow(versionId)
  expect(after?.retired_at, `${label}: marker set`).not.toBeNull()
  expect(after?.content, `${label}: content cleared`).toBeNull()
  expect(Number(after?.revision), `${label}: revision advanced by one`).toBe(
    Number(before?.revision) + 1,
  )

  // ⚑ THE AMENDMENT (SPEC §5, 2026-08-06). Retirement ends a session; it does not begin one, so the
  // generation is untouched. Advancing it here would double-count across a retire-then-reactivate
  // cycle, which §7 case 22 pins at exactly one advance.
  expect(Number(after?.generation), `${label}: generation UNCHANGED`).toBe(
    Number(before?.generation),
  )

  // The marker is kept, never hard-deleted — that is what makes a stale tab's capture refusable.
  expect(await countRows(versionId), `${label}: marker kept`).toBe(1)
  // The caller is handed the advanced token, not the one it sent (§4's token rule).
  expect(token.revision, `${label}: token echoes the stored revision`).toBe(Number(after?.revision))
}

describe('retire: all four callers share ONE transition', () => {
  const cases: {
    name: string
    semver: string
    command: (rev: number, gen: number) => RetireCommand
  }[] = [
    {
      name: 'discard',
      semver: '1.1.40',
      command: (rev, gen) => ({ by: 'discard', generation: gen, expectedRevision: rev }),
    },
    {
      name: 'admin-cleanup',
      semver: '1.1.41',
      command: (rev) => ({ by: 'admin-cleanup', expectedRevision: rev }),
    },
    {
      name: 'expiry',
      semver: '1.1.42',
      command: (rev) => ({
        by: 'expiry',
        expectedRevision: rev,
        cutoff: new Date(Date.now() + 60_000),
      }),
    },
  ]

  // `save-as-new` is NOT in this table — it gets its own test below, inside a real transaction. An
  // earlier draft listed it here while passing a `discard` command, on the reasoning that their
  // preconditions are identical. That is a test labelled for a caller it never exercises, which is
  // the false-coverage pattern this suite keeps catching in itself.
  it.each(cases)('$name produces the same row state', async ({ name, semver, command }) => {
    const { v, token } = await seedActiveCapture(semver)
    const before = await rawRow(v.id)

    const res = await retireFor(v.id, command(token.revision, token.generation))
    expect(res.ok, `${name} must retire`).toBe(true)
    if (!res.ok) return

    await expectRetired(v.id, before, res.token, name)
  })
})

describe('retire: the preconditions (§7 cases 23-24)', () => {
  it('case 23 — discard with a STALE expectedRevision conflicts, and nothing is retired', async () => {
    const { v, token } = await seedActiveCapture('1.1.23')

    // Another tab captures, moving the revision on.
    const newer = await captureFor(v.id, token.generation, token.revision, formDoc('newer work'))
    expect(newer.ok).toBe(true)

    const res = await retireFor(v.id, {
      by: 'discard',
      generation: token.generation,
      expectedRevision: token.revision, // stale
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'still active').toBeNull()
    expect((after?.content as Record<string, Record<string, string>>)['lesson:L1'].title).toBe(
      'newer work',
    )
  })

  it('case 24 — admin cleanup with a stale revision conflicts: what changed between looking and acting survives', async () => {
    const { v, token } = await seedActiveCapture('1.1.24')

    // The revision the operator saw via `recovery/meta`.
    const seenByAdmin = token.revision
    // ...then the teacher types again.
    const newer = await captureFor(
      v.id,
      token.generation,
      token.revision,
      formDoc('typed after the admin looked'),
    )
    expect(newer.ok).toBe(true)

    const res = await retireFor(v.id, { by: 'admin-cleanup', expectedRevision: seenByAdmin })
    expect(res).toEqual({ ok: false, reason: 'conflict' })

    const after = await rawRow(v.id)
    expect(after?.retired_at).toBeNull()
    expect((after?.content as Record<string, Record<string, string>>)['lesson:L1'].title).toBe(
      'typed after the admin looked',
    )
  })

  it('an already-retired row cannot be retired again', async () => {
    const { v, token } = await seedActiveCapture('1.1.26')
    const first = await retireFor(v.id, {
      by: 'discard',
      generation: token.generation,
      expectedRevision: token.revision,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    // Even carrying the CORRECT post-retirement revision: `retired_at IS NULL` is the term that
    // refuses it, which is what stops a second caller re-stamping the marker.
    const second = await retireFor(v.id, {
      by: 'discard',
      generation: first.token.generation,
      expectedRevision: first.token.revision,
    })
    expect(second).toEqual({ ok: false, reason: 'conflict' })
  })

  it('a stale GENERATION is refused even when the revision matches', async () => {
    const { v, token } = await seedActiveCapture('1.1.27')
    const res = await retireFor(v.id, {
      by: 'discard',
      generation: token.generation + 5,
      expectedRevision: token.revision,
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect((await rawRow(v.id))?.retired_at).toBeNull()
  })
})

describe('retire: expiry (§7 case 25)', () => {
  it('retires a row untouched since the cutoff', async () => {
    const { v, token } = await seedActiveCapture('1.1.25')
    await setRecoveryUpdatedAt(fx.payload, v.id, fx.users.editor.id, '2026-01-01T00:00:00.000Z')

    const res = await retireFor(v.id, {
      by: 'expiry',
      expectedRevision: token.revision,
      cutoff: new Date('2026-02-01T00:00:00.000Z'),
    })
    expect(res.ok).toBe(true)
    expect((await rawRow(v.id))?.retired_at).not.toBeNull()
  })

  /**
   * Case 25. The job selected this row as expired, but a capture landed before the retirement ran.
   * The cutoff term alone defeats it — every advancing write sets `updated_at = NOW()`, pushing the
   * row out of the window — so the fresh capture survives and the job simply moves on.
   */
  it('case 25 — a capture landing at the cutoff is NOT retired', async () => {
    const { v, token } = await seedActiveCapture('1.1.28')
    await setRecoveryUpdatedAt(fx.payload, v.id, fx.users.editor.id, '2026-01-01T00:00:00.000Z')

    // The job reads the row: revision R, updated_at old. Then the teacher types.
    const selectedRevision = token.revision
    const cutoff = new Date('2026-02-01T00:00:00.000Z')
    const landed = await captureFor(
      v.id,
      token.generation,
      token.revision,
      formDoc('typed at the cutoff'),
    )
    expect(landed.ok).toBe(true)

    const res = await retireFor(v.id, { by: 'expiry', expectedRevision: selectedRevision, cutoff })
    expect(res).toEqual({ ok: false, reason: 'conflict' })

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'the live session survived the expiry job').toBeNull()
    expect((after?.content as Record<string, Record<string, string>>)['lesson:L1'].title).toBe(
      'typed at the cutoff',
    )
  })

  it('does not retire a row touched since the cutoff, even with a matching revision', async () => {
    const { v, token } = await seedActiveCapture('1.1.29')
    // Untouched-since is the term under test, so the revision is deliberately correct.
    const res = await retireFor(v.id, {
      by: 'expiry',
      expectedRevision: token.revision,
      cutoff: new Date('2020-01-01T00:00:00.000Z'),
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect((await rawRow(v.id))?.retired_at).toBeNull()
  })
})

describe('retire: save-as-new demands a live transaction (runtime fail-closed)', () => {
  /**
   * Not a compile-time guarantee, and the docblock says so: a discriminated union constrains the
   * command's fields, not the `req` beside it. What it CAN guarantee is that the failure is loud.
   * A retirement that quietly ran on the pool would commit independently of the save it belongs to —
   * destroying a capture for work that was never saved, which is the exact loss this feature exists
   * to prevent.
   */
  it('throws rather than running on the pool when no transaction is active', async () => {
    const { v, token } = await seedActiveCapture('1.1.30')

    await expect(
      retireFor(v.id, {
        by: 'save-as-new',
        generation: token.generation,
        expectedRevision: token.revision,
      }),
    ).rejects.toThrow(/must run inside the caller’s transaction/)

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'nothing was retired').toBeNull()
    expect(after?.content, 'the capture is intact').not.toBeNull()
  })

  it('the other three callers do NOT require one', async () => {
    const { v, token } = await seedActiveCapture('1.1.31')
    const res = await retireFor(v.id, { by: 'admin-cleanup', expectedRevision: token.revision })
    expect(res.ok).toBe(true)
  })

  it('succeeds inside a real transaction, producing the same row state as the others', async () => {
    const { v, token } = await seedActiveCapture('1.1.32')
    const before = await rawRow(v.id)

    const res = await inTransaction((req) =>
      retire(
        req,
        { userId: fx.users.editor.id, sourceVersionId: v.id },
        { by: 'save-as-new', generation: token.generation, expectedRevision: token.revision },
      ),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return

    // The SAME assertion the other three run — so save-as-new is held to the identical standard
    // rather than a hand-copied subset of it.
    await expectRetired(v.id, before, res.token, 'save-as-new')
  })

  /**
   * ⚑ Case 19's SHAPE, at the kernel level: when the surrounding transaction rolls back, the
   * retirement must go with it and the capture must survive intact. This is the guarantee that makes
   * `requireTransaction` worth having — a retirement committed on the pool would destroy a capture for
   * a save that never happened.
   *
   * This is NOT case 19 itself. Case 19 requires a REAL failing statement inside
   * `endpoints/versionEdit.ts`'s semver-retry loop, proving the whole save rolls back and leaves no
   * orphan version. That belongs with the endpoint work; this proves the kernel half it rests on.
   */
  it('rolls back with its transaction, leaving the capture intact', async () => {
    const { v, token } = await seedActiveCapture('1.1.33')
    const before = await rawRow(v.id)

    const res = await inTransaction(
      (req) =>
        retire(
          req,
          { userId: fx.users.editor.id, sourceVersionId: v.id },
          { by: 'save-as-new', generation: token.generation, expectedRevision: token.revision },
        ),
      false, // roll back instead of committing
    )
    expect(res.ok, 'the statement itself succeeded inside the transaction').toBe(true)

    const after = await rawRow(v.id)
    expect(after?.retired_at, 'but the rollback undid it').toBeNull()
    expect(after?.content, 'the unsaved work survived').not.toBeNull()
    expect(Number(after?.revision)).toBe(Number(before?.revision))
  })
})
