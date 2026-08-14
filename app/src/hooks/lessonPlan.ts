import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionSlug,
} from 'payload'
import { NotFound, ValidationError } from 'payload'

import { isEditorFor, toId } from '../access'
import {
  derivePublicSlug,
  isValidPublicSlug,
  normalisePublicSlug,
  suffixedPublicSlug,
} from '../lib/publicSlug'
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

  // ⚑ NO EXPLICIT PLAN LOCK HERE, DELIBERATELY — and the reason is worth keeping, because "lock
  // both sides of a race" is the obvious instinct and it is wrong on this side.
  //
  // A pointer move ends in `UPDATE lesson_plans`, and that statement takes the row's write lock on
  // its own. Adding `lockLessonPlan` here would only move the same acquisition earlier, widening the
  // window the row is held while this hook does its validation reads — pure contention for no
  // additional guarantee. It was written, and then removed when the test meant to justify it passed
  // just as happily with it gone: the test was observing Postgres's own row lock, not the hook's.
  //
  // The asymmetry is the whole point. The DELETE side has no such statement — its guard decides from
  // a plain `SELECT`, which under READ COMMITTED reads straight past an uncommitted `UPDATE` — so the
  // lock is load-bearing there and only there. See `enforceOfficialNotDeletable` and
  // `lib/officialPointer.ts`, and `tests/int/officialPointerLock.int.spec.ts` for the mutation run
  // that settled it.

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

/** Visibility values that put a plan on the public internet (anything but `private`). */
const isPublishedVisibility = (v: unknown): boolean => v === 'unlisted' || v === 'listed'

const slugError = (message: string, req: Parameters<CollectionBeforeValidateHook>[0]['req']) =>
  new ValidationError(
    { collection: 'lesson-plans', errors: [{ message, path: 'publicSlug' }] },
    req.t,
  )

/**
 * Publication rules for a lesson plan (SPEC §2; `docs/DESIGN-public-library.md`).
 *
 * Three invariants, all of which exist because a public slug is a link a teacher forwards:
 *
 *   1. **A published plan HAS a slug.** Publishing without one would mint a plan that is public in
 *      the database and unreachable in the world — the worst of both, and invisible until someone
 *      goes looking. Derived from subject/grade/title when blank, and REFUSED when nothing usable
 *      can be derived, rather than falling back to a nameless URL.
 *   2. **The slug is FROZEN once the plan has been published.** Editable freely while `private`;
 *      immutable from the first moment visibility leaves `private`. This is what makes a shared
 *      link permanent by construction and is why there is no old-slug redirect table to maintain.
 *      The accepted cost is that a typo is only fixable by unpublishing first — the rarer event, and
 *      a deliberate administrative act.
 *   3. **The slug is well formed and unique.** Format is `lib/publicSlug.ts`'s business; uniqueness
 *      needs the database and is settled here, walking past collisions with a numeric suffix.
 *
 * ⚑ Uniqueness is ALSO enforced by a unique index on the column, and that is the authority — this
 * probe is a friendly error, not the guarantee. Two concurrent publishes can both find the same slug
 * free; the index is what makes exactly one of them win. Same division of labour as the
 * SubjectGrade duplicate-pair guard.
 *
 * Runs on create and update. Unlike `validateOfficialVersionPointer` there is no `req.user` carve-out
 * for system paths: ingest creates plans as `private` with no slug, which these rules already permit,
 * and a migration or fixture that publishes something should be held to the same invariants as a
 * human — a nameless public plan is not more acceptable for having been made by a script.
 */
export const validatePublication: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const previousVisibility = (originalDoc as { visibility?: unknown } | undefined)?.visibility
  const previousSlug = (originalDoc as { publicSlug?: unknown } | undefined)?.publicSlug
  const wasPublished = isPublishedVisibility(previousVisibility)

  // The effective post-write state: a PATCH may carry only one of the two fields.
  const nextVisibility = 'visibility' in data ? data.visibility : previousVisibility
  const slugSubmitted = 'publicSlug' in data
  const rawNextSlug = slugSubmitted ? data.publicSlug : previousSlug
  const nextSlug = typeof rawNextSlug === 'string' ? rawNextSlug.trim() : ''

  // 2. IMMUTABILITY — checked before anything else, so a rejected change cannot also be normalised
  // or de-duplicated on its way to being refused.
  if (wasPublished && slugSubmitted && typeof previousSlug === 'string' && nextSlug !== previousSlug) {
    throw slugError(
      'The public link for a published lesson plan cannot be changed — teachers may already have shared it. Set visibility back to Private first.',
      req,
    )
  }

  if (!isPublishedVisibility(nextVisibility)) {
    // Still private: a slug may be set, cleared or reshaped freely, but it must be VALID if present,
    // so an unusable value cannot sit waiting to be frozen by the next publish.
    if (nextSlug && !isValidPublicSlug(normalisePublicSlug(nextSlug))) {
      throw slugError(
        'A public link may use lowercase letters, numbers and hyphens only, and cannot be all digits.',
        req,
      )
    }
    if (slugSubmitted && nextSlug) data.publicSlug = normalisePublicSlug(nextSlug)
    return data
  }

  // 3. Published from here down. Normalise what was given, or derive one.
  let candidate = nextSlug ? normalisePublicSlug(nextSlug) : ''
  if (candidate && !isValidPublicSlug(candidate)) {
    throw slugError(
      'A public link may use lowercase letters, numbers and hyphens only, and cannot be all digits.',
      req,
    )
  }

  if (!candidate) {
    // Already published and keeping its slug (e.g. a visibility change unlisted → listed): nothing
    // to derive, and nothing to check. Leaving early also keeps this off the write path's hot line.
    if (wasPublished && typeof previousSlug === 'string' && previousSlug) return data

    const subjectGradeId = idFrom(data.subjectGrade ?? (originalDoc as { subjectGrade?: unknown } | undefined)?.subjectGrade)
    candidate = derivePublicSlug({
      ...(await subjectGradeParts(req, subjectGradeId)),
      title: (data.title ?? (originalDoc as { title?: unknown } | undefined)?.title) as string | undefined,
    })
  }

  // 1. A published plan HAS a slug — refuse rather than invent one.
  if (!candidate) {
    throw slugError(
      'This lesson plan needs a public link before it can be published, and one could not be derived from its title. Enter one.',
      req,
    )
  }

  data.publicSlug = await firstFreeSlug(req, candidate, idFrom(originalDoc?.id))
  return data
}

/** The subject name and grade behind a subject-grade id, for slug derivation. Absent parts are skipped. */
async function subjectGradeParts(
  req: Parameters<CollectionBeforeValidateHook>[0]['req'],
  subjectGradeId: number | undefined,
): Promise<{ subjectName?: string | null; grade?: number | null }> {
  if (subjectGradeId == null) return {}
  try {
    const sg = (await req.payload.findByID({
      collection: 'subject-grades' as CollectionSlug,
      id: subjectGradeId,
      depth: 1,
      overrideAccess: true,
      req,
    })) as { grade?: number | null; subject?: unknown }
    const subject = sg.subject as { name?: string } | number | null | undefined
    return {
      subjectName: typeof subject === 'object' && subject ? subject.name : undefined,
      grade: sg.grade ?? undefined,
    }
  } catch {
    // A missing subject-grade is not this hook's error to raise — the required-relationship
    // validation owns it. Derivation simply falls back to the title.
    return {}
  }
}

/**
 * The first slug in `base`, `base-2`, `base-3`… not already held by ANOTHER plan.
 *
 * Bounded rather than looping until success: an unbounded search would turn a pathological corpus
 * (or a bug) into a hang inside a write transaction. On exhaustion the caller gets the raw candidate
 * and the unique index produces the error, which is the honest outcome — a friendly probe that
 * cannot find an answer should defer to the authority, not invent one.
 */
async function firstFreeSlug(
  req: Parameters<CollectionBeforeValidateHook>[0]['req'],
  base: string,
  selfId: number | undefined,
): Promise<string> {
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    const candidate = suffixedPublicSlug(base, attempt)
    const { totalDocs } = await req.payload.count({
      collection: 'lesson-plans' as CollectionSlug,
      where:
        selfId == null
          ? { publicSlug: { equals: candidate } }
          : { and: [{ publicSlug: { equals: candidate } }, { id: { not_equals: selfId } }] },
      overrideAccess: true,
      req,
    })
    if (totalDocs === 0) return candidate
  }
  return base
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
 * `prewarmVersionArtifacts` explicitly. Never throws — and, since L3-03, never enlists its job rows
 * in the caller's transaction either, so a failed enqueue cannot roll back the pointer move it
 * follows (see `prewarmVersionArtifacts` for the full mechanism).
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

