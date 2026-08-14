/**
 * The ONLY path by which an anonymous caller may reach lesson content
 * (`docs/DESIGN-public-library.md` "Public-content boundary"; SPEC §4/§9).
 *
 * ⚑ WHY THIS IS A NARROW RESOLVER AND NOT AN ACCESS RULE. The obvious implementation — relax
 * `lessonPlanRead` / `lessonBundleVersionRead` for anonymous callers — is disqualifying, and the
 * reason is worth stating because it is not obvious:
 *
 *   - `lesson-bundle-versions` retains EVERY version, including Not-Official working copies that
 *     editors have saved mid-revision. Those are drafts in all but name. Anonymous read on that
 *     collection publishes unfinished work.
 *   - Official is a TRUST marker, not a permission boundary. Nothing in the collection's access
 *     rules distinguishes it, so "read only the Official one" cannot be expressed there.
 *
 * So the public surface resolves plan-first and pointer-only: a deliberately public Lesson Plan,
 * identified by its slug, served at whatever its CURRENT Official version is. An anonymous caller
 * never names a version id, and there is no query shape that reaches a non-Official version.
 *
 * ⚑ THE `overrideAccess: true` READS BELOW ARE SAFE ONLY BECAUSE OF THE GATES ABOVE THEM. That is
 * the same authorize-then-elevate pattern the custom endpoints use, and CLAUDE.md's standing rule
 * applies with full force: it is only as safe as the test that proves the gate runs first. The
 * negative cases in `tests/int/publicPublication.int.spec.ts` are not optional decoration.
 */
import type { Payload } from 'payload'

import { isPublicLibraryEnabled } from './publicLibrary'
import type { LessonBundleVersion, LessonPlan } from '../payload-types'

/**
 * Why a public lookup produced nothing. The CALLER MUST NOT LEAK THIS — every reason renders as the
 * same 404, or the endpoint becomes an oracle for which slugs exist, which plans are private, and
 * which are published-but-unpointed. It exists for logs and tests, where distinguishing "the feature
 * is off" from "that plan is private" is the difference between a useful failure and a mystery.
 */
export type PublicPlanMiss =
  | 'feature-disabled'
  | 'not-found'
  | 'not-public'
  | 'no-official-version'

export type PublicPlanResult =
  | { ok: true; plan: LessonPlan; version: LessonBundleVersion }
  | { ok: false; reason: PublicPlanMiss }

/** Visibility values that put a plan on the public internet. `listed` additionally appears in Explore. */
const PUBLIC_VISIBILITIES = new Set(['unlisted', 'listed'])

/**
 * Resolve a public slug to the plan and the exact version an anonymous visitor may see.
 *
 * Proves, in order and without shortcuts:
 *   1. public discovery is enabled for this DEPLOYMENT;
 *   2. a plan holds this slug;
 *   3. that plan is deliberately public;
 *   4. it has a current Official version — and that is the version returned.
 *
 * Step 1 is repeated here even though every caller is expected to have checked it. That is
 * deliberate belt-and-braces on the one function whose failure mode is publishing a corpus: a future
 * route that forgets the page-level gate still cannot get content out of this.
 */
export async function resolvePublicPlanBySlug(
  payload: Payload,
  slug: string,
): Promise<PublicPlanResult> {
  if (!isPublicLibraryEnabled()) return { ok: false, reason: 'feature-disabled' }

  const trimmed = slug.trim()
  if (!trimmed) return { ok: false, reason: 'not-found' }

  // Slug → plan. `limit: 2` rather than 1 so an impossible duplicate is detectable rather than
  // silently resolved to whichever row sorted first; the unique index should make this unreachable.
  const { docs } = await payload.find({
    collection: 'lesson-plans',
    where: { publicSlug: { equals: trimmed } },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })

  const plan = docs[0] as LessonPlan | undefined
  if (!plan || docs.length > 1) return { ok: false, reason: 'not-found' }

  // ⚑ The visibility check is on the RESOLVED ROW, not folded into the query above. Expressing it as
  // a `where` clause would make a private plan indistinguishable from a missing one in the code —
  // correct for the caller, but it also means a later edit that loosens the query has nothing left
  // asserting the rule. Kept explicit so the gate is visible at the point it is enforced.
  if (!PUBLIC_VISIBILITIES.has(String(plan.visibility))) {
    return { ok: false, reason: 'not-public' }
  }

  const officialId = typeof plan.officialVersion === 'object' && plan.officialVersion
    ? (plan.officialVersion as { id?: number }).id
    : (plan.officialVersion as number | null | undefined)
  if (officialId == null) return { ok: false, reason: 'no-official-version' }

  let version: LessonBundleVersion | null = null
  try {
    version = (await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: officialId,
      depth: 0,
      overrideAccess: true,
    })) as LessonBundleVersion
  } catch {
    // A pointer to a version that no longer exists is an integrity fault, not a public 404 with a
    // different meaning — but from the visitor's side it is still "nothing here".
    return { ok: false, reason: 'no-official-version' }
  }

  // Belt-and-braces on the relationship itself: the version must belong to THIS plan. A pointer that
  // crossed plans would be an integrity bug elsewhere, and this is the surface where it would become
  // a disclosure rather than a display glitch.
  const versionPlanId = typeof version.lessonPlan === 'object' && version.lessonPlan
    ? (version.lessonPlan as { id?: number }).id
    : (version.lessonPlan as number | null | undefined)
  if (versionPlanId != null && String(versionPlanId) !== String(plan.id)) {
    return { ok: false, reason: 'no-official-version' }
  }

  return { ok: true, plan, version }
}
