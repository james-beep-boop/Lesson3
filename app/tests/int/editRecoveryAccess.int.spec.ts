/**
 * `edit-recovery` collection: schema, access closure, and both parent cascades (design §2, §7 cases
 * 17–18). DB-backed, so this is the first thing that loads the collection into Payload at all — the
 * schema pushing is itself part of what this proves.
 *
 * ⚑ EVERY access assertion passes `overrideAccess: false` AND an explicit `user`. Payload's Local API
 * defaults `overrideAccess` to TRUE, which bypasses collection access entirely — a "closed
 * collection" suite written without it passes vacuously against a wide-open collection, proving
 * nothing. That is the whole point of these tests, so the flag is not incidental here.
 *
 * The closure is total: `read`, `create`, `update` and `delete` are denied to every role INCLUDING
 * Site Admin, because the endpoints are the only sanctioned path and they authorize first, then write
 * with `overrideAccess`. A Site Admin who could read this collection directly would be reading
 * teachers' unsaved work, which SPEC §13 forbids: administrators get existence and metadata through
 * `recovery/meta`, never content.
 */
import { beforeAll, afterAll, describe, expect, it, onTestFinished } from 'vitest'

import { NotFound, type Where } from 'payload'

import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  createUserVerified,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

const ROLES: RoleKey[] = ['siteAdmin', 'subjectAdmin', 'editor', 'teacher']

/**
 * Teardown delete that tolerates the row already being gone — and NOTHING else.
 *
 * Several of these records are deleted by the test itself as its ACT, so cleanup is normally a no-op
 * and a bare `.catch(() => {})` looks harmless. It is not: it would equally swallow a permission
 * error, a hook throwing, or the database being unreachable — turning a real failure into a silently
 * dirty database that surfaces later as an unrelated spec failing on leftover rows. Only `NotFound`
 * is expected here; everything else is rethrown.
 */
const deleteIfPresent = async (
  collection: 'lesson-bundle-versions' | 'users' | 'lesson-plans',
  id: number,
) => {
  try {
    await fx.payload.delete({ collection, id, overrideAccess: true })
  } catch (err) {
    if (err instanceof NotFound || (err as { status?: number })?.status === 404) return
    throw err
  }
}

/**
 * A non-Official version, so it can be deleted (the Official one is protected).
 *
 * Teardown is registered with `onTestFinished` rather than written at the end of each test body,
 * because an in-body cleanup does NOT run when the test fails — and that already bit here: a spurious
 * case-18 failure was caused by the read test failing before reaching its delete line, leaving rows
 * behind that the next test then counted.
 */
async function makeWorkingCopy(semver: string) {
  const created = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      sourceVersion: fx.version.id,
      title: `${MARK}WC-${semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })
  onTestFinished(async () => {
    await deleteIfPresent('lesson-bundle-versions', created.id)
  })
  return created
}

/** Seed a recovery row the only way anything may: a trusted system path. */
async function seedRecovery(userId: number, versionId: number, planId: number) {
  return fx.payload.create({
    collection: 'edit-recovery',
    data: {
      user: userId,
      sourceVersion: versionId,
      lessonPlan: planId,
      generation: 1,
      revision: 1,
      baseUpdatedAt: new Date().toISOString(),
      schemaVersion: 'test-1',
      content: { 'lesson:1': { title: `${MARK}unsaved` } },
    } as never,
    overrideAccess: true,
  })
}

/**
 * `payload.count` rather than `find(...).totalDocs`: find selects every matching row INCLUDING the
 * `content` jsonb and builds full documents only to discard them. `count` is also the house pattern
 * (hooks/userRoles.ts, collections/Messages.ts, collections/SubjectGrade.ts).
 */
const countRecovery = async (where: Where) =>
  (await fx.payload.count({ collection: 'edit-recovery', where, overrideAccess: true })).totalDocs

const byField = (field: 'user' | 'sourceVersion' | 'lessonPlan', id: number): Where => ({
  [field]: { equals: id },
})

describe('edit-recovery: the collection exists and stores a capture (system path only)', () => {
  it('accepts a row through a trusted path, and enforces one row per (user, sourceVersion)', async () => {
    const wc = await makeWorkingCopy('1.0.101')
    const row = await seedRecovery(fx.users.editor.id, wc.id, fx.plan.id)
    expect(row.id).toBeTruthy()

    // The compound unique index is what gives `start` its conflict target. It does NOT enforce
    // "capture never inserts" — that is the update-only SQL's job — but a SECOND row for the same
    // pair must be impossible, or a retirement marker could be sidestepped by inserting beside it.
    await expect(seedRecovery(fx.users.editor.id, wc.id, fx.plan.id)).rejects.toThrow()

    // A different user against the same source is a different pair, and is allowed.
    const other = await seedRecovery(fx.users.teacher.id, wc.id, fx.plan.id)
    expect(other.id).toBeTruthy()
  })
})

describe('edit-recovery: access is closed to every role, on every operation', () => {
  it('denies READ of a row to every role, including Site Admin', async () => {
    const wc = await makeWorkingCopy('1.0.102')
    const row = await seedRecovery(fx.users.editor.id, wc.id, fx.plan.id)

    for (const role of ROLES) {
      const user = fx.users[role]
      // findByID must not hand back the document...
      await expect(
        fx.payload.findByID({
          collection: 'edit-recovery',
          id: row.id,
          overrideAccess: false,
          user,
        }),
      ).rejects.toThrow()

      // ...and neither may a LIST query, which is the shape that would quietly succeed if `read`
      // returned a query constraint rather than a hard `false`.
      //
      // Observed, not assumed: Payload THROWS `Forbidden` here rather than returning zero documents.
      // A first draft of this test asserted `totalDocs === 0` and failed — worth recording, because
      // the two behaviours are not equally safe. An access function returning a constraint yields an
      // empty page that a caller can mistake for "this user has no captures"; a hard deny cannot be
      // mistaken for anything. If this ever starts returning an empty result instead of throwing,
      // `read` has been loosened from `false` to a filter and this assertion is the tripwire.
      await expect(
        fx.payload.find({
          collection: 'edit-recovery',
          overrideAccess: false,
          user,
          pagination: false,
        }),
        `${role} must not list recovery rows`,
      ).rejects.toThrow()
    }
  })

  it('denies CREATE to every role, including Site Admin', async () => {
    const wc = await makeWorkingCopy('1.0.103')
    for (const role of ROLES) {
      await expect(
        fx.payload.create({
          collection: 'edit-recovery',
          data: {
            user: fx.users[role].id,
            sourceVersion: wc.id,
            lessonPlan: fx.plan.id,
            generation: 1,
            revision: 1,
            baseUpdatedAt: new Date().toISOString(),
            schemaVersion: 'test-1',
          } as never,
          overrideAccess: false,
          user: fx.users[role],
        }),
        `${role} must not create a recovery row`,
      ).rejects.toThrow()
    }
    expect(await countRecovery(byField('sourceVersion', wc.id))).toBe(0)
  })

  it('denies UPDATE to every role — including the row OWNER', async () => {
    const wc = await makeWorkingCopy('1.0.104')
    const row = await seedRecovery(fx.users.editor.id, wc.id, fx.plan.id)

    for (const role of ROLES) {
      await expect(
        fx.payload.update({
          collection: 'edit-recovery',
          id: row.id,
          data: { revision: 999 } as never,
          overrideAccess: false,
          user: fx.users[role],
        }),
        `${role} must not update a recovery row`,
      ).rejects.toThrow()
    }

    const after = await fx.payload.findByID({
      collection: 'edit-recovery',
      id: row.id,
      overrideAccess: true,
    })
    expect(after.revision).toBe(1)
  })

  it('denies DELETE to every role — the owner cannot erase their own retirement marker', async () => {
    const wc = await makeWorkingCopy('1.0.105')
    const row = await seedRecovery(fx.users.editor.id, wc.id, fx.plan.id)

    for (const role of ROLES) {
      await expect(
        fx.payload.delete({
          collection: 'edit-recovery',
          id: row.id,
          overrideAccess: false,
          user: fx.users[role],
        }),
        `${role} must not delete a recovery row`,
      ).rejects.toThrow()
    }

    expect(await countRecovery(byField('sourceVersion', wc.id))).toBe(1)
  })
})

describe('edit-recovery: parent cascades (§7 cases 17-18)', () => {
  it('case 17 — deleting the source VERSION removes its recovery rows', async () => {
    const wc = await makeWorkingCopy('1.0.106')
    await seedRecovery(fx.users.editor.id, wc.id, fx.plan.id)
    await seedRecovery(fx.users.teacher.id, wc.id, fx.plan.id)
    expect(await countRecovery(byField('sourceVersion', wc.id))).toBe(2)

    // The ACT of this test, not teardown: deleting the parent is the thing being proven. Would raise
    // 23502 on the NOT NULL sourceVersion FK without the cascade.
    await fx.payload.delete({
      collection: 'lesson-bundle-versions',
      id: wc.id,
      overrideAccess: true,
    })
    expect(await countRecovery(byField('sourceVersion', wc.id))).toBe(0)
  })

  it('case 18 — deleting the USER removes their recovery rows, and only theirs', async () => {
    const wc = await makeWorkingCopy('1.0.107')
    const doomed = await createUserVerified(fx.payload, {
      email: `${MARK}doomed@example.test`.toLowerCase(),
      name: `${MARK}Doomed`,
      password: 'test1234',
    })
    // Failure-safe: this test DELETES `doomed` as its act, so cleanup is normally a no-op — but if an
    // assertion above the delete throws, the user survives the run without it. `.catch` absorbs the
    // already-deleted case rather than turning teardown into a second failure.
    onTestFinished(async () => {
      await deleteIfPresent('users', doomed.id)
    })
    await seedRecovery(doomed.id, wc.id, fx.plan.id)
    await seedRecovery(fx.users.editor.id, wc.id, fx.plan.id)
    expect(await countRecovery(byField('sourceVersion', wc.id))).toBe(2)

    await fx.payload.delete({ collection: 'users', id: doomed.id, overrideAccess: true })
    expect(await countRecovery(byField('user', doomed.id))).toBe(0)
    // Scoped to THIS version, not to the editor's rows globally. A global count couples this
    // assertion to every other test in the file — an earlier draft did exactly that and reported a
    // spurious failure here when an unrelated test above failed before its cleanup line.
    expect(
      await countRecovery({
        and: [byField('user', fx.users.editor.id), byField('sourceVersion', wc.id)],
      }),
      'the surviving user keeps their row',
    ).toBe(1)
  })

  /**
   * The inference `EditRecovery`'s docblock makes: `lessonPlan` is a required (NOT NULL) relationship
   * with NO cascade hook of its own, on the theory that deleting a plan cascades to its versions and
   * the version hook then runs per row. If that is wrong, this fails with a 23502 rather than
   * silently leaving orphans — which is exactly why it is asserted rather than reasoned about.
   */
  it('transitively — deleting the PLAN removes recovery rows through the version cascade', async () => {
    const plan = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}CascadePlan`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })
    // Same reasoning as the user above: deleting the plan is this test's act, but a failure before
    // that line would otherwise leave a plan and its version behind for the fixture sweep to find.
    onTestFinished(async () => {
      await deleteIfPresent('lesson-plans', plan.id)
    })
    const version = await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.0',
        title: `${MARK}CascadeVersion`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })
    await seedRecovery(fx.users.editor.id, version.id, plan.id)
    expect(await countRecovery(byField('lessonPlan', plan.id))).toBe(1)

    await fx.payload.delete({ collection: 'lesson-plans', id: plan.id, overrideAccess: true })
    expect(await countRecovery(byField('lessonPlan', plan.id))).toBe(0)
  })
})
