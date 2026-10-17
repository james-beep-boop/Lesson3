/**
 * "Keep for later" reads (SPEC §5, 2026-10-17) against a real database:
 * `listOwnCaptures`, `countUnsavedWorkOnVersion`, and the Manage list built on them.
 *
 * ⚑ The security-relevant property is U1's first case: the list is keyed on ONE user id and returns
 * nobody else's rows. The endpoints get that from `req.user.id`; this query gets it from its
 * caller, so it is pinned here rather than trusted. The rest is "never offer what the restore path
 * would refuse", and "never warn about losing nothing":
 *
 *   U1  own rows only; retired rows, started-but-empty sessions and `{}` captures are not work
 *   U2  the per-version count separates the caller from everyone else, by count only
 *   U3  the Manage rows: restorability agrees with the GET endpoint, the row carries what Manage needs
 *       to label and date it, and a version the caller can no longer edit is not listed
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import {
  formDoc,
  recoveryHarness,
  retireAllActiveFor,
  retireDirectly,
  setRecoveryContent,
  setRecoveryProvenance,
} from '../helpers/editRecovery.js'
import { countUnsavedWorkOnVersion, listOwnCaptures } from '../../src/lib/editRecovery/kernel.js'
import { listUnsavedWork } from '../../src/lib/editRecovery/unsavedWork.js'
import { CAPTURE_SCHEMA_VERSION } from '../../src/lib/editRecovery/provenance.js'
import type { User } from '../../src/payload-types.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const { poolReq, makeVersion, startFor, captureFor } = recoveryHarness(() => fx)

// Every test starts from "nobody has unsaved work", so a list assertion means exactly what it says.
beforeEach(async () => {
  for (const key of ['editor', 'subjectAdmin', 'teacher', 'siteAdmin'] as const) {
    await retireAllActiveFor(fx.payload, fx.users[key].id)
  }
})

let semverSeq = 0
const nextSemver = () => `1.9.${++semverSeq}`

/** A real capture by `userId`, taken with the provenance the live endpoint would record. */
async function keepWork(
  versionId: number,
  userId: number,
  opts: { sourceUpdatedAt?: string; title?: string } = {},
) {
  const t0 = await startFor(versionId, {
    userId,
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    ...(opts.sourceUpdatedAt ? { sourceUpdatedAt: opts.sourceUpdatedAt } : {}),
  })
  const res = await captureFor(
    versionId,
    t0.generation,
    t0.revision,
    formDoc(opts.title ?? 'kept'),
    userId,
  )
  if (!res.ok) throw new Error(`fixture: capture failed (${res.reason})`)
  return res.token
}

const ownIds = async (userId: number) =>
  (await listOwnCaptures(poolReq(), { userId })).map((c) => c.sourceVersionId)

describe('U1 — listOwnCaptures', () => {
  it("returns the caller's captures and nobody else's", async () => {
    const mine = await makeVersion(nextSemver())
    const theirs = await makeVersion(nextSemver())
    await keepWork(mine.id, fx.users.editor.id)
    await keepWork(theirs.id, fx.users.subjectAdmin.id)
    // The same version, a different user — the row the scoping must not leak.
    await keepWork(mine.id, fx.users.subjectAdmin.id)

    expect(await ownIds(fx.users.editor.id)).toEqual([mine.id])
    expect((await ownIds(fx.users.subjectAdmin.id)).sort()).toEqual([mine.id, theirs.id].sort())
  })

  it('carries the token the discard endpoint needs, and no content', async () => {
    const v = await makeVersion(nextSemver())
    const token = await keepWork(v.id, fx.users.editor.id)

    const [row] = await listOwnCaptures(poolReq(), { userId: fx.users.editor.id })
    expect(row.token).toEqual(token)
    expect(row).not.toHaveProperty('content')
  })

  it('newest first', async () => {
    const older = await makeVersion(nextSemver())
    const newer = await makeVersion(nextSemver())
    await keepWork(older.id, fx.users.editor.id)
    await keepWork(newer.id, fx.users.editor.id)

    expect(await ownIds(fx.users.editor.id)).toEqual([newer.id, older.id])
  })

  it('a retired capture is not work', async () => {
    const v = await makeVersion(nextSemver())
    await keepWork(v.id, fx.users.editor.id)
    await retireDirectly(fx.payload, v.id, fx.users.editor.id)

    expect(await ownIds(fx.users.editor.id)).toEqual([])
  })

  it('an Edit click with no typing is not work', async () => {
    const v = await makeVersion(nextSemver())
    await startFor(v.id, { userId: fx.users.editor.id })

    expect(await ownIds(fx.users.editor.id)).toEqual([])
  })

  it('an empty capture is not work', async () => {
    const v = await makeVersion(nextSemver())
    await keepWork(v.id, fx.users.editor.id)
    await setRecoveryContent(fx.payload, v.id, fx.users.editor.id, {})

    expect(await ownIds(fx.users.editor.id)).toEqual([])
  })
})

describe('U2 — countUnsavedWorkOnVersion', () => {
  const countFor = (versionId: number, callerId: number) =>
    countUnsavedWorkOnVersion(poolReq(), { sourceVersionId: versionId, callerId })

  it('nobody: zero, and not the caller', async () => {
    const v = await makeVersion(nextSemver())
    expect(await countFor(v.id, fx.users.siteAdmin.id)).toEqual({
      otherUsers: 0,
      includesCaller: false,
    })
  })

  it('separates the caller from everyone else', async () => {
    const v = await makeVersion(nextSemver())
    await keepWork(v.id, fx.users.editor.id)
    await keepWork(v.id, fx.users.subjectAdmin.id)

    expect(await countFor(v.id, fx.users.siteAdmin.id)).toEqual({
      otherUsers: 2,
      includesCaller: false,
    })
    expect(await countFor(v.id, fx.users.editor.id)).toEqual({
      otherUsers: 1,
      includesCaller: true,
    })
  })

  it('ignores retired rows, empty sessions and other versions', async () => {
    const v = await makeVersion(nextSemver())
    const elsewhere = await makeVersion(nextSemver())
    await keepWork(v.id, fx.users.editor.id)
    await retireDirectly(fx.payload, v.id, fx.users.editor.id)
    await startFor(v.id, { userId: fx.users.subjectAdmin.id })
    await keepWork(elsewhere.id, fx.users.teacher.id)

    expect(await countFor(v.id, fx.users.siteAdmin.id)).toEqual({
      otherUsers: 0,
      includesCaller: false,
    })
  })
})

describe('U3 — listUnsavedWork (the Manage rows)', () => {
  const rowsFor = (user: User) => listUnsavedWork({ ...poolReq(), user } as never, user)

  it('a capture taken against the current source is restorable', async () => {
    const v = await makeVersion(nextSemver())
    const token = await keepWork(v.id, fx.users.editor.id, {
      sourceUpdatedAt: new Date(String(v.updatedAt)).toISOString(),
    })

    const rows = await rowsFor(fx.users.editor)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      versionId: v.id,
      semver: v.semver,
      restorable: true,
      capturedAt: token.updatedAt,
      token: { generation: token.generation, revision: token.revision },
    })
    // The id, not a label: Manage resolves labels through the subject-grade lookup it already runs.
    expect(rows[0].subjectGradeId).toBe(fx.subjectGrade.id)
  })

  it('a moved source or a changed field shape is listed, but not restorable', async () => {
    const moved = await makeVersion(nextSemver())
    const reshaped = await makeVersion(nextSemver())
    // `startFor`'s default base is a fixed past instant, which no freshly created version matches.
    await keepWork(moved.id, fx.users.editor.id)
    await keepWork(reshaped.id, fx.users.editor.id, {
      sourceUpdatedAt: new Date(String(reshaped.updatedAt)).toISOString(),
    })
    await setRecoveryProvenance(fx.payload, reshaped.id, fx.users.editor.id, {
      schemaVersion: 'v0',
    })

    const rows = await rowsFor(fx.users.editor)
    expect(rows.map((r) => [r.versionId, r.restorable]).sort()).toEqual(
      [
        [moved.id, false],
        [reshaped.id, false],
      ].sort(),
    )
  })

  it('a Teacher with editing access nowhere is answered without a query', async () => {
    // Seeded as the plain Teacher, whose capture the kernel would return — the early return is
    // what keeps it off their page (and the query off their Manage render).
    const v = await makeVersion(nextSemver())
    await keepWork(v.id, fx.users.teacher.id)
    expect(await rowsFor(fx.users.teacher)).toEqual([])
  })

  it('a version in a subject-grade the caller cannot edit is not listed', async () => {
    // The kernel does not check roles — the endpoints do — so this seeds the state a revoked grant
    // leaves behind. ⚑ The holder must have editing access SOMEWHERE (the fixture's grade), or the
    // early return answers first and the per-version filter is never reached.
    const otherGrade = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: fx.subject.id, grade: 98 },
      overrideAccess: true,
    })
    const otherPlan = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}Other-grade plan`, subjectGrade: otherGrade.id },
      overrideAccess: true,
    })
    const elsewhere = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: otherPlan.id,
        subjectGrade: otherGrade.id,
        semver: '1.0.0',
        title: `${MARK}Other-grade v1.0.0`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as { id: number }
    const editable = await makeVersion(nextSemver())
    try {
      await keepWork(elsewhere.id, fx.users.editor.id)
      await keepWork(editable.id, fx.users.editor.id)

      expect((await ownIds(fx.users.editor.id)).sort(), 'precondition: both rows exist').toEqual(
        [elsewhere.id, editable.id].sort(),
      )
      expect((await rowsFor(fx.users.editor)).map((r) => r.versionId)).toEqual([editable.id])
    } finally {
      await fx.payload.delete({
        collection: 'lesson-plans',
        id: otherPlan.id,
        overrideAccess: true,
      })
      await fx.payload.delete({
        collection: 'subject-grades',
        id: otherGrade.id,
        overrideAccess: true,
      })
    }
  })
})
