/**
 * `readCaptureMetadata` — the Site-Admin view of what exists on a version (design §2 op 5, SPEC §13).
 *
 * ⚑ This file exists because the fix in `206252a` shipped without it. Two of its four changes live in
 * this one query — tombstones excluded, and the byte figure changed from `pg_column_size` to
 * `octet_length(content::text)` — and neither had a test. `recovery.http.spec.ts` covers the wire
 * shape (no content in the response), but a wire test cannot see a row it was never shown: proving
 * that a RETIRED row is absent needs a retired row seeded deliberately and then looked for.
 *
 * What is asserted here, and nowhere else:
 *
 *   M1  an active capture appears, with the metadata an operator acts on
 *   M2  a retired capture does NOT appear, however it was retired
 *   M3  the row set is scoped to the version asked about
 *   M4  `bytes` tracks the content's real size, and the type carries no content and no `retiredAt`
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { formDoc, recoveryHarness, retireDirectly } from '../helpers/editRecovery.js'
import { projectCapture } from '../../src/lib/editRecovery/projection.js'
import { readCaptureMetadata } from '../../src/lib/editRecovery/kernel.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const { poolReq, makeVersion, startFor, captureFor } = recoveryHarness(() => fx)

const metaFor = (versionId: number) =>
  readCaptureMetadata(poolReq(), { sourceVersionId: versionId })

/**
 * One user's active capture on an EXISTING version. Split from `seedCapture` because half the tests
 * here need a second user capturing on a version that already exists — inlining the start/capture
 * pair at those sites had produced four different policies for the same fixture failure.
 */
async function captureOn(versionId: number, title: string, userId = fx.users.editor.id) {
  const t0 = await startFor(versionId, { userId })
  const res = await captureFor(versionId, t0.generation, t0.revision, formDoc(title), userId)
  if (!res.ok) throw new Error(`fixture: capture failed (${res.reason})`)
  return { userId, token: res.token }
}

/** One user's active capture on a fresh version, carrying `title` as its prose. */
async function seedCapture(semver: string, title: string, userId?: number) {
  const v = await makeVersion(semver)
  return { v, ...(await captureOn(v.id, title, userId)) }
}

describe('M1 — an active capture is reported', () => {
  it('returns the user, the revision and a timestamp for a live capture', async () => {
    const { v, userId, token } = await seedCapture('1.4.1', 'still being typed')

    const rows = await metaFor(v.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(userId)
    // The revision an operator must echo back to cleanup — op 6's precondition depends on this
    // being the CURRENT value, not the one from whenever the row was created.
    expect(rows[0].revision).toBe(token.revision)
    expect(Number.isNaN(Date.parse(rows[0].updatedAt))).toBe(false)
  })

  it('reports every user holding a capture on the same version', async () => {
    const { v } = await seedCapture('1.4.2', 'editor prose')
    await captureOn(v.id, 'admin prose', fx.users.subjectAdmin.id)

    const rows = await metaFor(v.id)
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [fx.users.editor.id, fx.users.subjectAdmin.id].sort(),
    )
  })
})

/**
 * ⚑ M2 is the regression guard. Before the fix the query had no `retired_at IS NULL`, so it listed
 * everyone who had ever edited the version, long after their content was discarded — rows whose only
 * possible cleanup outcome is a 409, and in aggregate a permanent record of who was editing what and
 * when.
 */
describe('M2 — a tombstone is never reported', () => {
  it('a retired capture disappears from the view entirely', async () => {
    const { v, userId } = await seedCapture('1.4.3', 'about to be discarded')
    expect(await metaFor(v.id), 'precondition: it was there first').toHaveLength(1)

    await retireDirectly(fx.payload, v.id, userId)

    expect(await metaFor(v.id), 'the tombstone must not be listed').toHaveLength(0)
  })

  it('the LIVE captures on a version survive another user being retired', async () => {
    // The retired row and the active row share a version, so an over-broad filter would take both.
    const { v } = await seedCapture('1.4.4', 'editor keeps typing')
    await captureOn(v.id, 'admin discards', fx.users.subjectAdmin.id)
    await retireDirectly(fx.payload, v.id, fx.users.subjectAdmin.id)

    const rows = await metaFor(v.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(fx.users.editor.id)
  })

  it('a version whose only capture was retired reports nothing at all', async () => {
    const { v, userId } = await seedCapture('1.4.5', 'gone')
    await retireDirectly(fx.payload, v.id, userId)
    expect(await metaFor(v.id)).toEqual([])
  })
})

describe('M3 — the view is scoped to the version asked about', () => {
  it('a capture on a different version is not reported', async () => {
    const { v: mine } = await seedCapture('1.4.6', 'mine')
    const { v: theirs } = await seedCapture('1.4.7', 'theirs')

    expect(await metaFor(mine.id)).toHaveLength(1)
    expect(await metaFor(theirs.id)).toHaveLength(1)
  })

  it('a version with no captures reports an empty list, not an error', async () => {
    const v = await makeVersion('1.4.8')
    expect(await metaFor(v.id)).toEqual([])
  })
})

describe('M4 — the shape an operator gets', () => {
  it('carries no content and no retiredAt field', async () => {
    const { v } = await seedCapture('1.4.9', 'SECRET teacher prose')
    const rows = await metaFor(v.id)

    // The kernel does not SELECT the content column at all, so this is structural rather than a
    // strip step a later edit could drop.
    const serialised = JSON.stringify(rows)
    expect(serialised).not.toContain('SECRET teacher prose')
    expect(serialised).not.toContain('content')
    // `retiredAt` was removed with the tombstone filter: it could only ever have been null.
    expect(serialised).not.toContain('retiredAt')
    expect(Object.keys(rows[0]).sort()).toEqual(['bytes', 'revision', 'updatedAt', 'userId'])
  })

  /**
   * ⚑ The byte figure is APPROXIMATE, and the type's docblock now says so. `octet_length(content::text)`
   * renders jsonb in Postgres's canonical form — a space after every `:` and `,` — so it is
   * consistently a little LARGER than the compact `JSON.stringify` that `MAX_CAPTURE_BYTES` measures.
   * Pinned as a band rather than an equality, because asserting equality would be asserting the thing
   * that is not true.
   */
  it('bytes is close to, and never below, the compact serialised size', async () => {
    const title = 'a'.repeat(2_000)
    // One capture on a fresh version, so the row under test is the only row — no `find` and no
    // `if (!row) return`, which would have let this pass silently if the row ever went missing.
    const { v } = await seedCapture('1.4.10', title)

    const compact = Buffer.byteLength(JSON.stringify(projectCapture(formDoc(title))), 'utf8')
    const rows = await metaFor(v.id)
    expect(rows).toHaveLength(1)

    expect(rows[0].bytes).toBeGreaterThanOrEqual(compact)
    // Canonical whitespace is a per-separator overhead, not a multiplier; a 10% band is far more
    // than jsonb adds and far less than a wrong quantity (pg_column_size) would have differed by.
    expect(rows[0].bytes).toBeLessThan(compact * 1.1)
  })

  it('an empty capture reports zero bytes rather than null', async () => {
    const v = await makeVersion('1.4.11')
    await startFor(v.id)
    // A started-but-never-captured row has NULL content; COALESCE is what keeps this a number.
    const rows = await metaFor(v.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].bytes).toBe(0)
  })
})
