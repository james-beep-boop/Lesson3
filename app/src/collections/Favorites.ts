import type { Access, CollectionBeforeDeleteHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { isSiteAdmin } from '../access'
import type { User } from '../payload-types'

/**
 * Favorites (SPEC §10) — a per-user bookmark on a lesson PLAN (not a version: you favorite the
 * lesson, and the Official pointer moves underneath it). A pure personal join table:
 *
 *  - Toggled from The App via Payload's default REST (POST /api/favorites, DELETE /api/favorites/:id)
 *    — no custom endpoint needed (Payload-first, SPEC §13).
 *  - `user` is STAMPED server-side from the session on every authenticated create — a caller can
 *    never favorite on someone else's behalf. Read/delete are own-rows-only (Site Admin excepted,
 *    for support/cleanup). No update path at all: a favorite either exists or it doesn't.
 *  - The compound unique index makes double-favoriting impossible at the DB, whatever the UI races.
 *  - Not admin-managed content → hidden from the admin panel entirely (§13 minimal UI).
 *
 * Parent deletions: both relationships are required (NOT NULL columns with ON DELETE SET NULL FKs),
 * so deleting a referenced lesson plan or user must cascade-delete its favorites rows first — see
 * `cascadeDeleteLessonPlanFavorites` / `cascadeDeleteUserFavorites` on the parent collections.
 */

/** Own rows only; Site Admin sees all (global role, per SPEC §8). */
const ownFavorites: Access = ({ req: { user } }) => {
  const u = user as User | null
  if (!u) return false
  if (isSiteAdmin(u)) return true
  return { user: { equals: u.id } }
}

/** Stamp `user` from the session on authenticated creates — beforeValidate, so a REST POST that
 *  (correctly) omits `user` passes the required-field check, and a supplied foreign id is
 *  overridden before anything trusts it. System paths (overrideAccess, no `req.user` — e.g. test
 *  fixtures) may supply `user` explicitly; the field is required. */
const stampFavoriteUser: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (operation === 'create' && req.user) {
    return { ...data, user: req.user.id }
  }
  return data
}

/**
 * Cascade: delete favorites rows pointing at a parent BEFORE the parent row goes. Both favorites
 * relationships are required → NOT NULL columns with ON DELETE SET NULL FKs, so leaving rows behind
 * makes Postgres raise 23502 (the same trap `cascadeDeleteLessonPlanVersions` documents). Runs in
 * the parent delete's transaction (`req`) with overrideAccess.
 */
const cascadeDeleteFavoritesBy =
  (field: 'lessonPlan' | 'user'): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    await req.payload.delete({
      collection: 'favorites',
      where: { [field]: { equals: id } },
      overrideAccess: true,
      req,
    })
  }

/** beforeDelete on `lesson-plans`. */
export const cascadeDeleteLessonPlanFavorites = cascadeDeleteFavoritesBy('lessonPlan')
/** beforeDelete on `users`. */
export const cascadeDeleteUserFavorites = cascadeDeleteFavoritesBy('user')

export const Favorites: CollectionConfig = {
  slug: 'favorites',
  admin: {
    hidden: true,
  },
  indexes: [{ fields: ['user', 'lessonPlan'], unique: true }],
  access: {
    read: ownFavorites,
    create: ({ req: { user } }) => Boolean(user),
    update: () => false,
    delete: ownFavorites,
  },
  hooks: {
    beforeValidate: [stampFavoriteUser],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'lessonPlan',
      type: 'relationship',
      relationTo: 'lesson-plans',
      required: true,
      index: true,
    },
  ],
}
