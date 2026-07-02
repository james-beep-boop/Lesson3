/**
 * Favorites integration tests (§10 PR ①). Drives Payload's Local API with `overrideAccess: false`
 * + an explicit `user`, proving the collection's whole security model server-side:
 *
 *   - `user` is STAMPED from the session on create — nobody favorites on someone else's behalf.
 *   - Rows are own-only for read AND delete (Site Admin excepted).
 *   - The compound unique index rejects a double-favorite at the DB.
 *   - Deleting a parent lesson plan / user cascades its favorites rows (required relationship =
 *     NOT NULL column + ON DELETE SET NULL FK → 23502 without the cascade hooks).
 *
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
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

describe('favorites (§10): stamped ownership, own-only rows, unique per plan', () => {
  it('stamps `user` from the session — a supplied foreign user id is overridden', async () => {
    const fav = await fx.payload.create({
      collection: 'favorites',
      data: { lessonPlan: fx.plan.id, user: fx.users.editor.id }, // hostile: favorite "as" the editor
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

  it('rejects a double-favorite of the same plan (compound unique index)', async () => {
    await expect(
      fx.payload.create({
        collection: 'favorites',
        data: { lessonPlan: fx.plan.id, user: fx.users.teacher.id },
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
      data: { lessonPlan: fx.plan.id, user: fx.users.editor.id },
      overrideAccess: false,
      user: fx.users.editor,
    })
    await expect(
      fx.payload.update({
        collection: 'favorites',
        id: fav.id,
        data: { lessonPlan: fx.plan.id },
        overrideAccess: false,
        user: fx.users.editor,
      }),
    ).rejects.toThrow()
    await fx.payload.delete({ collection: 'favorites', id: fav.id, overrideAccess: true })
  })
})

describe('favorites cascade with their parents (NOT NULL FK → 23502 without it)', () => {
  it('deleting a lesson plan removes its favorites rows first', async () => {
    const plan = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}FavCascadePlan`, subjectGrade: fx.subjectGrade.id },
      overrideAccess: true,
    })
    await fx.payload.create({
      collection: 'favorites',
      data: { lessonPlan: plan.id, user: fx.users.teacher.id },
      overrideAccess: false,
      user: fx.users.teacher,
    })

    await expect(
      fx.payload.delete({ collection: 'lesson-plans', id: plan.id, overrideAccess: true }),
    ).resolves.toBeTruthy()
    const { totalDocs } = await fx.payload.count({
      collection: 'favorites',
      where: { lessonPlan: { equals: plan.id } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  it('deleting a user removes their favorites rows first', async () => {
    const user = await fx.payload.create({
      collection: 'users',
      data: {
        name: `${MARK}FavCascadeUser`,
        email: `${MARK.toLowerCase()}favcascade@test.local`,
        password: fx.password,
      },
      overrideAccess: true,
    })
    await fx.payload.create({
      collection: 'favorites',
      data: { lessonPlan: fx.plan.id, user: user.id },
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
