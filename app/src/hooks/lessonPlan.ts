import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionSlug,
} from 'payload'
import { NotFound, ValidationError } from 'payload'

import { isEditorFor, toId } from '../access'
import { prewarmVersionArtifacts } from '../jobs/prewarmVersionArtifacts'
import { relId } from '../lib/relId'
import type { User } from '../payload-types'

const LESSON_BUNDLE_VERSIONS = 'lesson-bundle-versions' as CollectionSlug

/**
 * `req.context` key carrying the set of lesson-plan ids whose deletion is in progress this request.
 * The version-retention guard (`enforceOfficialNotDeletable`) reads it and stands down for the
 * Official versions of those plans — the pointer is moot once the parent plan is going away.
 */
export const DELETING_LESSON_PLAN_IDS = 'deletingLessonPlanIds'

const idFrom = (value: unknown): number | undefined => {
  const id = toId(value as never)
  return typeof id === 'number' ? id : undefined
}

const validationError = (message: string, req: Parameters<CollectionBeforeValidateHook>[0]['req']) =>
  new ValidationError(
    {
      collection: 'lesson-plans',
      errors: [{ message, path: 'officialVersion' }],
    },
    req.t,
  )

export const validateOfficialVersionPointer: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  // Invariant: a lesson plan keeps exactly one Official version. Reject an AUTHENTICATED update that
  // clears the pointer to null — browse skips a plan with no Official, its detail can 404, and the
  // "one Official" product rule breaks. System paths (no `req.user`: migrations, roundtrip cleanup,
  // the int-fixture teardown that nulls the pointer before deleting versions) legitimately clear it
  // via overrideAccess and are exempt — same trusted-system carve-out as the field-split/immutability
  // hooks. (Create with no pointer yet is fine: ingest sets it in a follow-up update.)
  if (operation === 'update' && req.user && data && 'officialVersion' in data && !idFrom(data.officialVersion)) {
    throw validationError('A lesson plan must keep one Official version; the pointer cannot be cleared.', req)
  }

  // Invariant: a NEW plan cannot be created already pointing at an Official version. The pointer is
  // only set in a follow-up UPDATE, once a version exists under THIS plan (ingest + the fixture do
  // exactly that). On create `originalDoc` is absent, so the "version belongs to this plan" ownership
  // check below is skipped — a same-grade version of ANOTHER plan would slip through, letting two
  // plans share one Official version. Reject any pointer on an authenticated create outright. System
  // paths (no `req.user`: ingest, migrations) never set it on create and stay exempt.
  if (operation === 'create' && req.user && data?.officialVersion) {
    throw validationError(
      'A new lesson plan cannot set an Official version on create; create a version under it first.',
      req,
    )
  }

  if (!data?.officialVersion) return data

  const officialVersionId = idFrom(data.officialVersion)
  if (!officialVersionId) {
    throw validationError('Official version must reference a saved lesson-plan version.', req)
  }

  const version = (await req.payload.findByID({
    collection: LESSON_BUNDLE_VERSIONS,
    id: officialVersionId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { lessonPlan?: unknown; subjectGrade?: unknown }

  const planId = idFrom(originalDoc?.id)
  const versionPlanId = idFrom(version.lessonPlan)
  if (planId && versionPlanId !== planId) {
    throw validationError('Official version must belong to this lesson plan.', req)
  }

  const planSubjectGradeId = idFrom(data.subjectGrade ?? originalDoc?.subjectGrade)
  const versionSubjectGradeId = idFrom(version.subjectGrade)
  if (planSubjectGradeId && versionSubjectGradeId !== planSubjectGradeId) {
    throw validationError('Official version must match this lesson plan subject-grade.', req)
  }

  return data
}

/**
 * Cascade: delete a lesson plan's child versions BEFORE the plan row goes. `lesson_bundle_versions.
 * lesson_plan_id` is NOT NULL, but its FK is `ON DELETE SET NULL`, so leaving children behind makes
 * Postgres raise `23502` (not-null violation) — which the admin UI surfaces as the opaque "An unknown
 * error has occurred." We remove the children first, in the SAME transaction (`req`) with
 * `overrideAccess`. The Official version among them is normally undeletable (`enforceOfficialNotDeletable`);
 * we flag this plan in `req.context` so that guard stands down here — the plan, and its pointer, is
 * being deleted. Mirrors the `purgeMarked` teardown order (versions before plans).
 */
export const cascadeDeleteLessonPlanVersions: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const ids = (req.context[DELETING_LESSON_PLAN_IDS] as Set<string> | undefined) ?? new Set<string>()
  ids.add(String(id))
  req.context[DELETING_LESSON_PLAN_IDS] = ids

  await req.payload.delete({
    collection: LESSON_BUNDLE_VERSIONS,
    where: { lessonPlan: { equals: id } },
    overrideAccess: true,
    req,
  })
}

/**
 * Pre-warm docx+pdf whenever an AUTHENTICATED write moves the Official pointer — make-official,
 * the admin repair form (the lesson-plans document view), and any future admin path — so teachers
 * hit a warm artifact cache, never the cold 202/poll flow (teacher-first T1, DECISIONS 2026-07-08).
 * The `req.user` gate is the same system-path carve-out as `validateOfficialVersionPointer`:
 * fixtures/migrations don't mass-enqueue; ingest (a system path that DOES want warming) calls
 * `prewarmVersionArtifacts` explicitly. Never throws; job rows ride the caller's transaction.
 */
export const prewarmOfficialArtifacts: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (!req.user) return doc
  const newId = idFrom((doc as { officialVersion?: unknown }).officialVersion)
  if (newId == null) return doc
  if (newId === idFrom((previousDoc as { officialVersion?: unknown } | undefined)?.officialVersion)) return doc
  await prewarmVersionArtifacts(req, newId)
  return doc
}

/**
 * Teacher stars follow the Official (teacher-first T4, DECISIONS 2026-07-08 §7): when the
 * Official pointer MOVES, favorites on the OLD Official belonging to users WITHOUT edit rights
 * on this subject-grade are re-pointed to the new Official; editors' favorites stay put (theirs
 * are deliberate per-version pins, the 2026-07-06 semantics). A follower who already starred the
 * new Official just loses the now-redundant old row (the compound unique index would reject the
 * re-point). Running inside the pointer-move transaction ALSO means the re-point lands before
 * make-official's optional delete-previous — so follower stars survive promote-and-delete.
 *
 * No `req.user` gate (unlike the prewarm sibling): this is data consistency, owed on system
 * pointer moves too. Per-row best-effort — a favorites hiccup must never fail a promotion; a
 * skipped row at worst falls to the delete-previous cascade (the pre-T4 behavior).
 */
export const retargetFollowerFavorites: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const newId = idFrom((doc as { officialVersion?: unknown }).officialVersion)
  const prevId = idFrom((previousDoc as { officialVersion?: unknown } | undefined)?.officialVersion)
  if (newId == null || prevId == null || newId === prevId) return doc
  const sgId = idFrom((doc as { subjectGrade?: unknown }).subjectGrade)

  const { docs: favs } = await req.payload.find({
    collection: 'favorites',
    where: { version: { equals: prevId } },
    depth: 0,
    pagination: false, // bounded by the user count
    overrideAccess: true,
    req,
  })
  if (favs.length === 0) return doc

  // Batch the owners (to split followers from editor-pinners) and the already-starred-new set.
  const ownerIds = [...new Set(favs.map((f) => relId(f.user)).filter((id) => id != null))]
  const [{ docs: owners }, { docs: onNew }] = await Promise.all([
    req.payload.find({
      collection: 'users',
      where: { id: { in: ownerIds } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    }),
    req.payload.find({
      collection: 'favorites',
      where: { version: { equals: newId } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    }),
  ])
  const ownerById = new Map(owners.map((u) => [String(u.id), u as User]))
  const alreadyOnNew = new Set(onNew.map((f) => String(relId(f.user))))

  for (const fav of favs) {
    try {
      const owner = ownerById.get(String(relId(fav.user)))
      if (!owner || isEditorFor(owner, sgId)) continue // an editor's pin is deliberate — keep it
      if (alreadyOnNew.has(String(owner.id))) {
        await req.payload.delete({ collection: 'favorites', id: fav.id, overrideAccess: true, req })
      } else {
        await req.payload.update({
          collection: 'favorites',
          id: fav.id,
          data: { version: newId },
          overrideAccess: true,
          req,
        })
      }
    } catch (err) {
      // A row that vanished mid-loop (the owner un-favorited concurrently) is a genuine best-effort
      // skip: Payload throws NotFound BEFORE issuing failing SQL, so the shared transaction is
      // intact and the loop can continue. ANY OTHER error — notably a compound-unique violation
      // when a follower starred the new Official in a concurrent request — has already POISONED the
      // Postgres transaction (every later statement fails with 25P02, and a COMMIT silently rolls
      // back). Swallowing that would let make-official return {ok:true} on a promotion Postgres
      // actually rolled back (false success). So re-throw: the endpoint's killTransaction runs and
      // it reports failure; a retry converges (the racing star is now visible, so its old row is
      // DELETED, not re-pointed — no constraint hit). Best-effort truly per-row would need a
      // savepoint per row (deferred — see NEXT-SESSION); this at least never lies about success.
      if (err instanceof NotFound) {
        req.payload.logger.warn(
          { favoriteId: fav.id, prevOfficialId: prevId, newOfficialId: newId },
          'retargetFollowerFavorites: favorite row vanished mid-retarget, skipped',
        )
        continue
      }
      throw err
    }
  }
  return doc
}

