import type { CollectionBeforeDeleteHook, CollectionConfig } from 'payload'

/**
 * Edit recovery (SPEC §5/§13, design in `docs/DESIGN-working-drafts.md`) — a per-user, per-source
 * capture of UNSAVED prose edits, so an idle-timeout logout stops destroying work in progress. One
 * row per `(user, sourceVersion)`: either an active capture or that pair's retirement marker.
 *
 * The feature is "edit recovery", never "draft" — `draft` is a RESERVED word here, already meaning an
 * unofficial saved version (SPEC §13). The file path `DESIGN-working-drafts.md` predates the rename.
 *
 * ⚑ **What the compound unique index does and does NOT do.** It enforces one row per
 * `(user, sourceVersion)` and gives `start`'s upsert its conflict target. It does **not** enforce the
 * protocol's central rule that *capture never inserts*:
 *
 *   - a capture INSERTing when no row exists would SUCCEED — the index sees no duplicate, and the
 *     explicit-start step would have been silently optional;
 *   - a capture UPDATEing a RETIRED row would also succeed — resurrection, which is the exact thing
 *     retirement markers exist to prevent.
 *
 * Only capture's update-only SQL (`WHERE … retired_at IS NULL AND revision = $expected`) and its
 * regression case (§7 case 15) prevent those. Do not read the index as protection and write an
 * upsert here: an earlier revision of the design called capture an "upsert" and thereby undid the
 * whole protocol. `start` is the ONLY insert-or-reactivate path.
 *
 * **Access is closed on all four operations, and each closure carries its own reason** (SPEC §5):
 *
 *   - `create`/`update` — `start` needs an atomic upsert and `capture` an atomic CAS; Payload's
 *     default REST offers neither, so both go through endpoints that authorize first and then write
 *     with `overrideAccess`.
 *   - `read` — closing it makes "lost editing access ⇒ cannot restore" STRUCTURAL rather than
 *     incidental. The restore prompt reads through an endpoint that re-runs authorization.
 *   - `delete` — stops an owner erasing their own retirement marker, which would let a retired
 *     capture be recreated.
 *
 * Nothing client-facing, so it is hidden from the admin panel entirely (§13 minimal UI). Site Admins
 * see existence and metadata through `GET /:id/recovery/meta`, never content.
 *
 * ⚑ Tests that assert this closure MUST pass `overrideAccess: false` **and** an explicit `user` —
 * Payload's Local API defaults `overrideAccess` to true and would bypass every function below,
 * passing vacuously. House pattern: the docblock of `tests/int/access.int.spec.ts`.
 *
 * Parent deletions: `user` and `sourceVersion` are required, so they are NOT NULL columns with
 * ON DELETE SET NULL FKs — leaving rows behind makes Postgres raise 23502, the trap
 * `cascadeDeleteLessonPlanVersions` and `cascadeDeleteVersionFavorites` already document. The two
 * hooks below delete children before the parent row goes (§7 cases 17–18). Deleting a lesson PLAN is
 * covered transitively: it cascades to its versions, and the version hook runs per row even for bulk
 * where-based deletes, so `lessonPlan` needs no third hook of its own.
 */

/**
 * Cascade: remove recovery rows pointing at a parent BEFORE the parent row goes, inside the parent
 * delete's transaction (`req`) and with `overrideAccess` (collection `delete` is closed to everyone).
 *
 * These rows are DELETED, not retired. Retirement is a tombstone for a source that still exists, to
 * fence resurrection of a live pair; once the parent is gone the pair can never recur, so there is
 * nothing left to fence and a tombstone would only leak that the user had been editing.
 */
const cascadeDeleteRecoveryBy =
  (field: 'sourceVersion' | 'user'): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    await req.payload.delete({
      collection: 'edit-recovery',
      where: { [field]: { equals: id } },
      overrideAccess: true,
      req,
    })
  }

/** beforeDelete on `lesson-bundle-versions` — per row even for bulk deletes, so plan deletion is
 *  covered transitively (§7 case 17). */
export const cascadeDeleteVersionRecovery = cascadeDeleteRecoveryBy('sourceVersion')
/** beforeDelete on `users` (§7 case 18). */
export const cascadeDeleteUserRecovery = cascadeDeleteRecoveryBy('user')

/** Every operation closed. Written once and reused so no operation can drift open by omission. */
const closed = () => false

export const EditRecovery: CollectionConfig = {
  slug: 'edit-recovery',
  admin: {
    hidden: true,
  },
  indexes: [{ fields: ['user', 'sourceVersion'], unique: true }],
  access: {
    read: closed,
    create: closed,
    update: closed,
    delete: closed,
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
      name: 'sourceVersion',
      type: 'relationship',
      relationTo: 'lesson-bundle-versions',
      required: true,
      index: true,
    },
    {
      // Denormalised from the source version so metadata/cleanup can list by plan without loading
      // every version. Never authoritative — `sourceVersion` is.
      name: 'lessonPlan',
      type: 'relationship',
      relationTo: 'lesson-plans',
      required: true,
      index: true,
    },
    {
      // Server-issued. Fences RETIREMENT across sessions: a retirement carrying a stale generation
      // is refused, so a slow tab cannot retire a session that has since been reactivated.
      name: 'generation',
      type: 'number',
      required: true,
    },
    {
      // Monotonic per write. Fences CONCURRENT WRITES: capture is a compare-and-set on this value,
      // and every advancing write returns the resulting token for the client to adopt.
      name: 'revision',
      type: 'number',
      required: true,
    },
    {
      // Null = active. Set = tombstone, with `content` cleared in the same atomic statement.
      name: 'retiredAt',
      type: 'date',
      index: true,
    },
    {
      // The source's `updatedAt` when this session began. A mismatch at restore means the source
      // moved underneath the capture, so the overlay is view/copy/discard only — never applied.
      name: 'baseUpdatedAt',
      type: 'date',
      required: true,
    },
    {
      // Guards restoring a capture taken under an older field shape. Same rule: view/copy only.
      name: 'schemaVersion',
      type: 'text',
      required: true,
    },
    {
      // A SPARSE MAP OF PROSE LEAVES KEYED BY ROW ID — not a bundle snapshot. Row ids appear only as
      // keys, are validated against the current source on restore, and are never written back as
      // field values. Derived from the `*_PROSE` whitelists in `hooks/fieldSplit.ts`, so admin-only
      // fields (`resourceLinks`, `phase`, `rubric`, answer keys, META…) cannot enter a capture by
      // construction rather than by policy.
      //
      // JSON rather than native nested fields, per the exception AGENTS.md records for exactly this
      // collection: the native-fields rule governs the CONTENT OF RECORD (the bundle), and a sparse
      // overlay of arbitrary row ids has no fixed shape to model. NULL once retired.
      name: 'content',
      type: 'json',
    },
  ],
}
