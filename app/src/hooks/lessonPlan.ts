import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { APIError, NotFound, ValidationError, type PayloadRequest } from 'payload'

import { isEditorFor, toId } from '../access'
import { isPubliclyVisible } from '../lib/publicLibrary'
import {
  derivePublicSlug,
  isValidPublicSlug,
  normalisePublicSlug,
  suffixedPublicSlug,
} from '../lib/publicSlug'
import { prewarmVersionArtifacts } from '../jobs/prewarmVersionArtifacts'
import { relId } from '../lib/relId'
import type { User } from '../payload-types'
import { planSeries } from '../lib/versionSeries'
import { deleteSeriesVersions, guardOfficialPointer } from './versionSeries'

const idFrom = (value: unknown): number | undefined => {
  const id = toId(value as never)
  return typeof id === 'number' ? id : undefined
}

/**
 * A field-scoped `ValidationError` for this collection. `path` defaults to `officialVersion` because
 * that was the only rule when this existed; publication rules pass `publicSlug`. Parameterised
 * rather than copied, so Payload's error shape (`{ collection, errors: [{ message, path }] }` plus
 * `req.t`) — a vendor API this project pins deliberately — is spelled out in exactly one place.
 */
const validationError = (
  message: string,
  req: PayloadRequest,
  path: 'officialVersion' | 'publicSlug' | 'subjectGrade' = 'officialVersion',
) => new ValidationError({ collection: 'lesson-plans', errors: [{ message, path }] }, req.t)

/**
 * A plan's subject-grade is ingest identity, not editable curriculum content. Moving it after create
 * would change catalogue placement and every subject-grade-scoped permission while its immutable
 * versions still carry the original relationship. Even a plan with no Official pointer must not be
 * movable: that state is a repair concern, not an editing route.
 *
 * ⚑ IT ALSO SUBSUMES THE `subjectGrade`-ONLY CASE that `validateOfficialVersionPointer` below guards
 * with a long ⚑ of its own. Running first in the same `beforeValidate` array, this rejects any changed
 * value outright, so by the time that hook sees a request carrying `subjectGrade` the value provably
 * equals the stored one. Its `|| 'subjectGrade' in data` disjunct is therefore unreachable-in-practice
 * rather than dead: it is the backstop if this hook is ever removed. Cross-referenced in both
 * directions on purpose — two overlapping guards with no mention of each other is how the next reader
 * deletes the wrong one.
 *
 * This hook is intentionally unconditional on `req.user` and `overrideAccess`. Field access controls
 * who may reach an update; this invariant controls what any update may do. A deliberate data repair
 * therefore needs an explicit migration rather than an ordinary Payload update masquerading as an
 * edit. Create is untouched so ingest can set the relationship once.
 */
export const enforcePlanSubjectGradeImmutable: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || !data || !('subjectGrade' in data)) return data

  const storedId = idFrom(originalDoc?.subjectGrade)
  const submittedId = idFrom(data.subjectGrade)
  if (storedId !== undefined && submittedId !== storedId) {
    throw validationError(
      'A lesson plan’s subject and grade are fixed when it is uploaded. To correct them, delete the lesson plan and upload it again.',
      req,
      'subjectGrade',
    )
  }

  return data
}

export const validateOfficialVersionPointer = guardOfficialPointer(planSeries)

/** The one user-facing sentence for a malformed slug, stated once so the two paths cannot drift. */
const SLUG_FORMAT_MESSAGE =
  'A public link may use lowercase letters, numbers and hyphens only, and cannot be all digits.'

const slugError = (message: string, req: PayloadRequest) =>
  validationError(message, req, 'publicSlug')

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

  const prev = originalDoc as
    | { visibility?: unknown; publicSlug?: unknown; subjectGrade?: unknown; title?: unknown }
    | undefined
  const previousSlug = typeof prev?.publicSlug === 'string' ? prev.publicSlug : ''
  const wasPublished = isPubliclyVisible(prev?.visibility)

  // The effective post-write state: a PATCH may carry only one of the two fields.
  const nextVisibility = 'visibility' in data ? data.visibility : prev?.visibility
  const slugSubmitted = 'publicSlug' in data
  const rawNextSlug = slugSubmitted ? data.publicSlug : previousSlug
  const nextSlug = typeof rawNextSlug === 'string' ? rawNextSlug.trim() : ''

  // 2. IMMUTABILITY — checked before anything else, so a rejected change cannot also be normalised
  // or de-duplicated on its way to being refused.
  if (wasPublished && slugSubmitted && nextSlug !== previousSlug) {
    throw slugError(
      'The public link for a published lesson plan cannot be changed — teachers may already have shared it. Set visibility back to Private first.',
      req,
    )
  }

  // Format is checked ONCE, for both the private and published paths — they applied the identical
  // rule and the identical message from two places before.
  const candidateFromInput = nextSlug ? normalisePublicSlug(nextSlug) : ''
  if (candidateFromInput && !isValidPublicSlug(candidateFromInput)) {
    throw slugError(SLUG_FORMAT_MESSAGE, req)
  }

  if (!isPubliclyVisible(nextVisibility)) {
    // Still private: a slug may be set, cleared or reshaped freely — it is only frozen once published.
    if (slugSubmitted && candidateFromInput) data.publicSlug = candidateFromInput
    return data
  }

  // 3. Published from here down.
  //
  // ⚑ A plan that is ALREADY published and is not changing its slug is done: the value is frozen and
  // unique-indexed, so re-deriving or re-probing it can only confirm what the last publish settled.
  // This return covers every later write to a published plan — a visibility toggle, a title edit,
  // make-official — and keeps a `count` query off each of them. (It sat inside the `if (!candidate)`
  // block before, where it was unreachable: `nextSlug` falls back to the stored slug, so `candidate`
  // was never empty on exactly the path the return existed to catch.)
  if (wasPublished && candidateFromInput === previousSlug) return data

  let candidate = candidateFromInput
  if (!candidate) {
    candidate = derivePublicSlug({
      ...(await subjectGradeParts(req, idFrom(data.subjectGrade ?? prev?.subjectGrade))),
      title: (data.title ?? prev?.title) as string | undefined,
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

/** How far the collision walk goes before deferring to the unique index. */
const MAX_SLUG_ATTEMPTS = 25

/** The subject name and grade behind a subject-grade id, for slug derivation. Absent parts are skipped. */
async function subjectGradeParts(
  req: PayloadRequest,
  subjectGradeId: number | undefined,
): Promise<{ subjectName?: string | null; grade?: number | null }> {
  if (subjectGradeId == null) return {}
  try {
    const sg = (await req.payload.findByID({
      collection: 'subject-grades',
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
 * ONE query, not one per candidate. The obvious shape — probe, increment, probe again — issues up to
 * `MAX_SLUG_ATTEMPTS` sequential round trips *inside the caller's write transaction*, so a collision
 * would hold the plan row locked for that whole walk (negligible against a local Postgres, far less
 * so when the database is a network hop away). Asking which of the candidates are taken costs the
 * same single index scan on `lesson_plans_public_slug_idx` whether none or all of them exist, so the
 * common case — a free base slug — is one query either way and nothing regresses.
 *
 * Bounded rather than looping until success: an unbounded search would turn a pathological corpus
 * (or a bug) into a hang inside that transaction. On exhaustion the caller gets the raw candidate and
 * the unique index produces the error, which is the honest outcome — a friendly probe that cannot
 * find an answer should defer to the authority, not invent one.
 */
async function firstFreeSlug(
  req: PayloadRequest,
  base: string,
  selfId: number | undefined,
): Promise<string> {
  const candidates = Array.from({ length: MAX_SLUG_ATTEMPTS }, (_, i) =>
    suffixedPublicSlug(base, i + 1),
  )
  const taken = { publicSlug: { in: candidates } }
  const { docs } = await req.payload.find({
    collection: 'lesson-plans',
    where: selfId == null ? taken : { and: [taken, { id: { not_equals: selfId } }] },
    select: { publicSlug: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const used = new Set(docs.map((doc) => (doc as { publicSlug?: string | null }).publicSlug))
  return candidates.find((candidate) => !used.has(candidate)) ?? base
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
  await deleteSeriesVersions(req, planSeries, id)
  const decks = await req.payload.delete({
    collection: 'decks',
    where: { lessonPlan: { equals: id } },
    overrideAccess: true,
    req,
  })
  if (decks.errors.length) throw new APIError('Could not remove this plan’s decks.', 500)
  const files = await req.payload.delete({
    collection: 'supporting-files',
    where: { lessonPlan: { equals: id } },
    overrideAccess: true,
    req,
  })
  if (files.errors.length) throw new APIError('Could not remove this plan’s supporting files.', 500)
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
export const prewarmOfficialArtifacts: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (!req.user) return doc
  const newId = idFrom((doc as { officialVersion?: unknown }).officialVersion)
  if (newId == null) return doc
  if (newId === idFrom((previousDoc as { officialVersion?: unknown } | undefined)?.officialVersion))
    return doc
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
export const retargetFollowerFavorites: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
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
