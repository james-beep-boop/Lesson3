import type {
  Access,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'

import { APIError } from 'payload'

import { isSiteAdmin } from '../access'
import { findReadableVersion } from '../lib/readBundle'
import { relId } from '../lib/relId'
import type { User } from '../payload-types'

/**
 * Favorites (SPEC §10) — a per-user bookmark on a lesson-plan VERSION. Two semantics by role
 * (teacher-first T4, 2026-07-08): for users with edit rights on the subject-grade, a favorite is
 * a deliberate per-version PIN (the 2026-07-06 semantics — 1.0.2 stays 1.0.2); for everyone else
 * it FOLLOWS the Official — `retargetFollowerFavorites` (hooks/lessonPlan.ts) re-points follower
 * rows whenever the pointer moves. A pure personal join table:
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
 * Refuse a favorite on a version the caller cannot read — including one that does not exist — with
 * a 404 before the insert, rather than letting the foreign key turn it into a generic 500 (audit
 * F-C24-001). The FK stays: a version deleted between this lookup and the insert is still refused by
 * the database, just less politely. System paths (no `req.user`) are trusted, as for the stamp above.
 */
const requireReadableFavoriteVersion: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !req.user) return data
  const id = relId(data?.version)
  // An absent version is left to the field's own `required` check, which answers 400.
  if (id == null) return data
  const version = await findReadableVersion(req.payload, {
    id,
    user: req.user as User,
    req,
    select: { semver: true },
  })
  if (!version) throw new APIError('That lesson version is not available.', 404)
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
  // No native editing locks: no Take over UI here, so a lock could only block App actions
  // (DECISIONS 2026-10-24 "Native document locks"; access/lockedDocuments.ts).
  lockDocuments: false,
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
    beforeValidate: [stampFavoriteUser, requireReadableFavoriteVersion],
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
