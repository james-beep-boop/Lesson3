import type { Access, CollectionBeforeDeleteHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { isSiteAdmin } from '../access'
import type { User } from '../payload-types'

/**
 * Favorites (SPEC §10) — a per-user bookmark on a lesson-plan VERSION (per-version by design,
 * 2026-07-06: favoriting 1.0.2 pins THAT snapshot; it does not follow a later Official change).
 * A pure personal join table:
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
 * so deleting a referenced version or user must cascade-delete its favorites rows first — see
 * `cascadeDeleteVersionFavorites` / `cascadeDeleteUserFavorites` on the parent collections. The
 * version hook covers EVERY way a version dies (save-as-new deleteSource, make-official
 * deletePrevious, and the plan-delete cascade — all `payload.delete` calls that run the version's
 * own beforeDelete hooks per row), so no separate lesson-plan hook is needed.
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
  (field: 'version' | 'user'): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    await req.payload.delete({
      collection: 'favorites',
      where: { [field]: { equals: id } },
      overrideAccess: true,
      req,
    })
  }

/** beforeDelete on `lesson-bundle-versions` — runs per row even for bulk (where-based) deletes,
 *  so the plan-delete version cascade is covered too. */
export const cascadeDeleteVersionFavorites = cascadeDeleteFavoritesBy('version')
/** beforeDelete on `users`. */
export const cascadeDeleteUserFavorites = cascadeDeleteFavoritesBy('user')

export const Favorites: CollectionConfig = {
  slug: 'favorites',
  admin: {
    hidden: true,
  },
  indexes: [{ fields: ['user', 'version'], unique: true }],
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
      name: 'version',
      type: 'relationship',
      relationTo: 'lesson-bundle-versions',
      required: true,
      index: true,
    },
  ],
}
