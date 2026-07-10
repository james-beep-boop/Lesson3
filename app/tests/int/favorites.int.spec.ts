/**
 * Favorites integration tests (§10, per-version — redesign PR ① 2026-07-06). Drives Payload's Local
 * API with `overrideAccess: false` + an explicit `user`, proving the collection's whole security
 * model server-side:
 *
 *   - `user` is STAMPED from the session on create — nobody favorites on someone else's behalf.
 *   - Rows are own-only for read AND delete (Site Admin excepted).
 *   - The compound unique index rejects a double-favorite at the DB.
 *   - Deleting a referenced version / user cascades its favorites rows (required relationship =
 *     NOT NULL column + ON DELETE SET NULL FK → 23502 without the cascade hooks). The version hook
 *     lives on `lesson-bundle-versions`, so a PLAN delete cascades favorites transitively (plan →
 *     versions → favorites) — both the direct and the transitive path are pinned below.
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { MARK, createUserVerified, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { relId } from '../../src/lib/relId.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

/** All favorites rows visible to `user` (own-only unless Site Admin). */
async function favoritesVisibleTo(user: RoleFixture['users'][keyof RoleFixture['users']]) {
  const { docs } = await fx.payload.find({
    collection: 'favorites',
    overrideAccess: false,
    user,
    depth: 0,
    pagination: false,
  })
  return docs
}

/** A version on `planId` (defaults to the fixture plan, where a non-1.0.0 semver makes it a
 *  NON-Official, deletable sibling — the Official one is not deletable). */
async function createVersion(semver: string, planId: number = fx.plan.id, titleBase = 'Plan') {
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: planId,
      subjectGrade: fx.subjectGrade.id,
      semver,
      title: `${MARK}${titleBase} v${semver}`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })
}

describe('favorites (§10): stamped ownership, own-only rows, unique per version', () => {
  it('stamps `user` from the session — a supplied foreign user id is overridden', async () => {
    const fav = await fx.payload.create({
      collection: 'favorites',
      data: { version: fx.version.id, user: fx.users.editor.id }, // hostile: favorite "as" the editor
      overrideAccess: false,
      user: fx.users.teacher,
    })
    expect(relId(fav.user)).toBe(fx.users.teacher.id)

    // Own-only read: the teacher sees their row; the editor (named in the hostile payload) sees none.
    expect((await favoritesVisibleTo(fx.users.teacher)).map((f) => f.id)).toContain(fav.id)
    expect(await favoritesVisibleTo(fx.users.editor)).toHaveLength(0)

    // Site Admin reads all (global role).
    expect((await favoritesVisibleTo(fx.users.siteAdmin)).map((f) => f.id)).toContain(fav.id)
  })

  it('rejects a double-favorite of the same version (compound unique index)', async () => {
    await expect(
      fx.payload.create({
        collection: 'favorites',
        data: { version: fx.version.id, user: fx.users.teacher.id },
        overrideAccess: false,
        user: fx.users.teacher,
      }),
    ).rejects.toThrow()
  })

  it('delete is own-only: another user cannot remove the row, the owner can', async () => {
    const [fav] = await favoritesVisibleTo(fx.users.teacher)
    await expect(
      fx.payload.delete({
        collection: 'favorites',
        id: fav.id,
        overrideAccess: false,
        user: fx.users.editor,
      }),
    ).rejects.toThrow()

    await expect(
      fx.payload.delete({
        collection: 'favorites',
        id: fav.id,
        overrideAccess: false,
        user: fx.users.teacher,
      }),
    ).resolves.toBeTruthy()
    expect(await favoritesVisibleTo(fx.users.teacher)).toHaveLength(0)
  })

  it('rejects an update — a favorite either exists or it does not', async () => {
    const fav = await fx.payload.create({
      collection: 'favorites',
      data: { version: fx.version.id, user: fx.users.editor.id },
      overrideAccess: false,
      user: fx.users.editor,
    })
    await expect(
      fx.payload.update({
        collection: 'favorites',
        id: fav.id,
        data: { version: fx.version.id },
        overrideAccess: false,
        user: fx.users.editor,
      }),
    ).rejects.toThrow()
    await fx.payload.delete({ collection: 'favorites', id: fav.id, overrideAccess: true })
  })
})

describe('follower stars track the Official; editor pins stay (teacher-first T4)', () => {
  beforeAll(async () => {
    // Exact-array assertions below need a clean slate — earlier blocks may leave favorites behind.
    await fx.payload.delete({ collection: 'favorites', where: { id: { exists: true } }, overrideAccess: true })
  })

  /** Move the fixture plan's Official pointer (system path — the retarget hook has no user gate). */
  const movePointer = (versionId: number) =>
    fx.payload.update({
      collection: 'lesson-plans',
      id: fx.plan.id,
      data: { officialVersion: versionId } as never,
      overrideAccess: true,
    })

  /** The version each of `user`'s favorites points at. */
  async function favoriteVersionsOf(user: RoleFixture['users'][keyof RoleFixture['users']]) {
    return (await favoritesVisibleTo(user)).map((f) => relId(f.version))
  }

  afterAll(async () => {
    // Restore the fixture pointer and drop this block's favorites + versions.
    await movePointer(fx.version.id)
    await fx.payload.delete({ collection: 'favorites', where: { id: { exists: true } }, overrideAccess: true })
  })

  it("a teacher's star follows a pointer move; an editor's pin does not", async () => {
    const v2 = await createVersion('9.0.0')
    await fx.payload.create({
      collection: 'favorites',
      data: { version: fx.version.id, user: fx.users.teacher.id },
      overrideAccess: false,
      user: fx.users.teacher,
    })
    await fx.payload.create({
      collection: 'favorites',
      data: { version: fx.version.id, user: fx.users.editor.id },
      overrideAccess: false,
      user: fx.users.editor,
    })

    await movePointer(v2.id)

    expect(await favoriteVersionsOf(fx.users.teacher)).toEqual([v2.id]) // followed
    expect(await favoriteVersionsOf(fx.users.editor)).toEqual([fx.version.id]) // pinned

    // Move back — the follower returns too; the pin still holds.
    await movePointer(fx.version.id)
    expect(await favoriteVersionsOf(fx.users.teacher)).toEqual([fx.version.id])
    expect(await favoriteVersionsOf(fx.users.editor)).toEqual([fx.version.id])
    await fx.payload.delete({ collection: 'favorites', where: { id: { exists: true } }, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v2.id, overrideAccess: true })
  })

  it('a follower already starred on the NEW Official just loses the redundant old row (unique index)', async () => {
    const v2 = await createVersion('9.1.0')
    await fx.payload.create({
      collection: 'favorites',
      data: { version: fx.version.id, user: fx.users.teacher.id },
      overrideAccess: false,
      user: fx.users.teacher,
    })
    await fx.payload.create({
      collection: 'favorites',
      data: { version: v2.id, user: fx.users.teacher.id },
      overrideAccess: false,
      user: fx.users.teacher,
    })

    await movePointer(v2.id)

    expect(await favoriteVersionsOf(fx.users.teacher)).toEqual([v2.id]) // exactly one row survives

    await movePointer(fx.version.id)
    await fx.payload.delete({ collection: 'favorites', where: { id: { exists: true } }, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v2.id, overrideAccess: true })
  })

  it("a follower star SURVIVES promote-and-delete-previous (re-point lands before the cascade)", async () => {
    // Simulate make-official?deletePrevious=true's ordering: pointer move, THEN delete the old
    // Official. Pre-T4 the delete cascade would have taken the teacher's favorite with it.
    const v1 = await createVersion('9.2.0')
    const v2 = await createVersion('9.3.0')
    await movePointer(v1.id)
    await fx.payload.create({
      collection: 'favorites',
      data: { version: v1.id, user: fx.users.teacher.id },
      overrideAccess: false,
      user: fx.users.teacher,
    })

    await movePointer(v2.id)
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v1.id, overrideAccess: true })

    expect(await favoriteVersionsOf(fx.users.teacher)).toEqual([v2.id])

    await movePointer(fx.version.id)
    await fx.payload.delete({ collection: 'favorites', where: { id: { exists: true } }, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v2.id, overrideAccess: true })
  })
})

describe('favorites cascade with their parents (NOT NULL FK → 23502 without it)', () => {
  it('deleting a version removes its favorites rows first (the direct hook)', async () => {
    const candidate = await createVersion('1.0.1')
    await fx.payload.create({
      collection: 'favorites',
      data: { version: candidate.id, user: fx.users.teacher.id },
      overrideAccess: false,
      user: fx.users.teacher,
    })

    await expect(
      fx.payload.delete({ collection: 'lesson-bundle-versions', id: candidate.id, overrideAccess: true }),
    ).resolves.toBeTruthy()
    const { totalDocs } = await fx.payload.count({
      collection: 'favorites',
      where: { version: { equals: candidate.id } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  it('deleting a lesson plan removes its versions favorites rows (transitive: plan → versions → favorites)', async () => {
    const plan = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}FavCascadePlan`, subjectGrade: fx.subjectGrade.id },
      overrideAccess: true,
    })
    const version = await createVersion('1.0.0', plan.id, 'FavCascadePlan')
    await fx.payload.create({
      collection: 'favorites',
      data: { version: version.id, user: fx.users.teacher.id },
      overrideAccess: false,
      user: fx.users.teacher,
    })

    await expect(
      fx.payload.delete({ collection: 'lesson-plans', id: plan.id, overrideAccess: true }),
    ).resolves.toBeTruthy()
    const { totalDocs } = await fx.payload.count({
      collection: 'favorites',
      where: { version: { equals: version.id } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  it('deleting a user removes their favorites rows first', async () => {
    const user = await createUserVerified(fx.payload, {
      name: `${MARK}FavCascadeUser`,
      email: `${MARK.toLowerCase()}favcascade@test.local`,
      password: fx.password,
    })
    await fx.payload.create({
      collection: 'favorites',
      data: { version: fx.version.id, user: user.id },
      overrideAccess: false,
      user,
    })

    await expect(
      fx.payload.delete({ collection: 'users', id: user.id, overrideAccess: true }),
    ).resolves.toBeTruthy()
    const { totalDocs } = await fx.payload.count({
      collection: 'favorites',
      where: { user: { equals: user.id } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })
})
