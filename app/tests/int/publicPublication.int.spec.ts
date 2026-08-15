/**
 * The public-content boundary: publication rules and the anonymous resolver
 * (`src/hooks/lessonPlan.ts` → `validatePublication`; `src/lib/publicPlan.ts`;
 * `docs/DESIGN-public-library.md`; SPEC §2/§4).
 *
 * ⚑ THE NEGATIVE CASES ARE THE POINT. `resolvePublicPlanBySlug` makes trusted `overrideAccess: true`
 * reads, which is only safe because four gates run first — the feature switch, the plan existing,
 * the plan being deliberately public, and the served version being the plan's CURRENT Official.
 * CLAUDE.md's standing rule for that pattern is that it is worth exactly as much as the test proving
 * the gate runs first, so each gate here has a case that fails without it.
 *
 * The rule this file exists to defend, above all others: **publication and Official are independent,
 * and neither implies the other.** Approving a version must never publish it; publishing must never
 * be able to expose a version that is not the current Official.
 *
 * Requires a DB (like all of `tests/int`).
 */
import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest'

import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import { resolvePublicPlanBySlug } from '../../src/lib/publicPlan.js'
import type { LessonBundleVersion, LessonPlan } from '../../src/payload-types.js'

let fx: RoleFixture

const ORIGINAL_FLAG = process.env.PUBLIC_LIBRARY_ENABLED

/** Public discovery is off by default; these tests opt in, and restore afterwards. */
const enableFeature = () => {
  process.env.PUBLIC_LIBRARY_ENABLED = '1'
}
const disableFeature = () => {
  delete process.env.PUBLIC_LIBRARY_ENABLED
}

/** A fresh plan, so cases cannot interfere with one another. Publication rules never read a version. */
async function makePlan(label: string): Promise<LessonPlan> {
  return (await fx.payload.create({
    collection: 'lesson-plans',
    data: { title: `${MARK}${label}`, subjectGrade: fx.subjectGrade.id },
    overrideAccess: true,
  })) as LessonPlan
}

/**
 * A fresh plan AND its Official version — three writes including a full bundle body, so it is used
 * only by the cases that actually resolve a version. The publication-rule and access cases take
 * `makePlan` above.
 */
async function makePlanWithOfficial(label: string): Promise<{ plan: LessonPlan; version: LessonBundleVersion }> {
  const plan = await makePlan(label)

  const version = (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.0.0',
      title: `${MARK}${label} v1.0.0`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as LessonBundleVersion

  const withOfficial = (await fx.payload.update({
    collection: 'lesson-plans',
    id: plan.id,
    data: { officialVersion: version.id },
    overrideAccess: true,
  })) as LessonPlan

  return { plan: withOfficial, version }
}

const publish = (id: number, data: Record<string, unknown>) =>
  fx.payload.update({ collection: 'lesson-plans', id, data: data as never, overrideAccess: true })

/**
 * The FIELD-LEVEL messages of a rejected write.
 *
 * ⚑ `rejects.toThrow(/…/)` is the wrong tool for a Payload `ValidationError`: its top-level
 * `message` is the generic "The following field is invalid: publicSlug", and the message the hook
 * actually wrote — the one an administrator reads and the only thing that distinguishes "you may not
 * rename this" from "that slug is malformed" — lives in `data.errors[].message`. Matching the
 * wrapper would pass for ANY validation failure on that field, including one from a future rule,
 * so this reaches for the real text and the path alongside it.
 */
async function fieldErrors(op: Promise<unknown>): Promise<{ message: string; path: string }[]> {
  try {
    await op
  } catch (error) {
    const data = (error as { data?: { errors?: { message?: string; path?: string }[] } }).data
    const errors = data?.errors ?? []
    if (errors.length === 0) {
      throw new Error(`expected field-level errors, got: ${String((error as Error).message)}`)
    }
    return errors.map((e) => ({ message: String(e.message ?? ''), path: String(e.path ?? '') }))
  }
  throw new Error('expected the write to be rejected, but it succeeded')
}

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  if (ORIGINAL_FLAG === undefined) delete process.env.PUBLIC_LIBRARY_ENABLED
  else process.env.PUBLIC_LIBRARY_ENABLED = ORIGINAL_FLAG
  await fx?.teardown()
})

describe('publication rules', () => {
  it('defaults every plan to private with no public slug — publication is opt-in', async () => {
    const plan = await makePlan('Defaults')
    expect(plan.visibility, 'a new plan is private').toBe('private')
    expect(plan.publicSlug ?? null, 'a new plan has no public link').toBeNull()
  })

  it('derives a slug from subject, grade and title on first publish', async () => {
    const plan = await makePlan('Cells and Cell Structure')
    const published = (await publish(plan.id, { visibility: 'listed' })) as LessonPlan

    expect(published.publicSlug).toBeTruthy()
    expect(published.publicSlug).toContain('grade')
    expect(published.publicSlug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  it('accepts an explicit slug and normalises it', async () => {
    const plan = await makePlan('Explicit slug')
    const published = (await publish(plan.id, {
      visibility: 'unlisted',
      publicSlug: 'My Chosen Link',
    })) as LessonPlan

    expect(published.publicSlug).toBe('my-chosen-link')
  })

  /**
   * ⚑ THE FREEZE. This is the whole reason the slug design has no redirect table: a forwarded
   * WhatsApp link is permanent by construction. If this stops throwing, every previously shared link
   * silently becomes a 404 the moment an admin edits a title-derived slug.
   */
  it('REFUSES to change the slug of a published plan', async () => {
    const plan = await makePlan('Frozen link')
    const published = (await publish(plan.id, {
      visibility: 'listed',
      publicSlug: 'frozen-link',
    })) as LessonPlan
    expect(published.publicSlug).toBe('frozen-link')

    const errors = await fieldErrors(publish(plan.id, { publicSlug: 'a-different-link' }))
    expect(errors[0]?.path).toBe('publicSlug')
    expect(errors[0]?.message).toMatch(/cannot be changed/i)

    const reread = await fx.payload.findByID({
      collection: 'lesson-plans',
      id: plan.id,
      overrideAccess: true,
    })
    expect(reread.publicSlug, 'the original link survives the refused edit').toBe('frozen-link')
  })

  it('allows the slug to change again once the plan is back to private', async () => {
    const plan = await makePlan('Unpublish to rename')
    await publish(plan.id, { visibility: 'listed', publicSlug: 'first-name' })
    await publish(plan.id, { visibility: 'private' })

    const renamed = (await publish(plan.id, { publicSlug: 'second-name' })) as LessonPlan
    expect(renamed.publicSlug).toBe('second-name')
  })

  it('lets a published plan move between unlisted and listed without touching its slug', async () => {
    const plan = await makePlan('Visibility shuffle')
    const first = (await publish(plan.id, { visibility: 'unlisted' })) as LessonPlan
    const second = (await publish(plan.id, { visibility: 'listed' })) as LessonPlan

    expect(second.publicSlug).toBe(first.publicSlug)
  })

  it('rejects a malformed slug rather than silently mangling it into something permanent', async () => {
    const plan = await makePlan('Bad slug')
    const errors = await fieldErrors(publish(plan.id, { visibility: 'listed', publicSlug: '42' }))
    expect(errors[0]?.path).toBe('publicSlug')
    expect(errors[0]?.message).toMatch(/lowercase letters, numbers and hyphens/i)
  })

  it('gives two plans with the same title distinct links', async () => {
    const a = await makePlan('Twin Title')
    const b = await makePlan('Twin Title')

    const publishedA = (await publish(a.id, { visibility: 'listed' })) as LessonPlan
    const publishedB = (await publish(b.id, { visibility: 'listed' })) as LessonPlan

    expect(publishedA.publicSlug).toBeTruthy()
    expect(publishedB.publicSlug).toBeTruthy()
    expect(publishedB.publicSlug).not.toBe(publishedA.publicSlug)
  })
})

/**
 * ⚑ EVERY CASE HERE PASSES `overrideAccess: false` AND AN EXPLICIT `user`. With either omitted,
 * Payload bypasses collection and field access entirely and these tests pass while testing nothing —
 * the house pattern documented in `tests/int/access.int.spec.ts`'s docblock.
 *
 * Publishing is Site-Admin-only, a deliberately NARROWER gate than the `canEditStructure` that
 * guards title and subjectGrade: a Subject Administrator curates content for their subject, but
 * putting a lesson plan on the open internet is a decision about the deployment as a whole.
 */
describe('publication field access', () => {
  const attemptPublish = (userKey: 'subjectAdmin' | 'editor' | 'teacher', planId: number) =>
    fx.payload.update({
      collection: 'lesson-plans',
      id: planId,
      data: { visibility: 'listed' } as never,
      overrideAccess: false,
      user: fx.users[userKey],
    })

  /**
   * ⚑ ASSERTS THE OUTCOME, NOT THE MECHANISM — because the two differ by role, and only the outcome
   * is the security property.
   *
   * An Editor and a Teacher are stopped by COLLECTION access (`lessonPlanUpdate` admits Site and
   * Subject Admins only), so their write throws. A Subject Administrator passes that gate and is
   * stopped by FIELD access instead — and Payload's behaviour there is to SILENTLY STRIP the field
   * it will not let you write, so the update RESOLVES, reporting success, having quietly not
   * published anything.
   *
   * That surprised this test, which originally expected a rejection for all three and failed on the
   * Subject Admin. Worth knowing rather than papering over: a caller who lacks field access gets no
   * error, so any future UI that offers publishing to a Subject Administrator would appear to work
   * and silently do nothing. The invariant that actually matters — the plan is not published — holds
   * either way, and is what this asserts.
   */
  it.each(['subjectAdmin', 'editor', 'teacher'] as const)(
    'does not let a %s publish a lesson plan',
    async (userKey) => {
      // ⚑ Needs the FULL fixture, unlike the publication-rule cases above. These write as a real
      // user, and `validateOfficialVersionPointer` refuses an AUTHENTICATED update to a plan whose
      // Official pointer is absent ("the pointer cannot be cleared") — its system-path carve-out is
      // what lets the `overrideAccess: true` cases get away with a plan that has no version.
      const { plan } = await makePlanWithOfficial(`Access ${userKey}`)

      await attemptPublish(userKey, plan.id).catch(() => undefined)

      const reread = await fx.payload.findByID({
        collection: 'lesson-plans',
        id: plan.id,
        overrideAccess: true,
      })
      expect(reread.visibility, 'the plan must stay private').toBe('private')
      expect(reread.publicSlug ?? null, 'and gain no public link').toBeNull()
    },
  )

  it('lets a Site Admin publish', async () => {
    const { plan } = await makePlanWithOfficial('Access siteAdmin')
    const published = (await fx.payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { visibility: 'listed' } as never,
      overrideAccess: false,
      user: fx.users.siteAdmin,
    })) as LessonPlan

    expect(published.visibility).toBe('listed')
    expect(published.publicSlug).toBeTruthy()
  })
})

describe('resolvePublicPlanBySlug', () => {
  // Public discovery is off by default; every case here needs it on. The one case that asserts the
  // DISABLED behaviour turns it off explicitly, mid-test, after publishing.
  beforeEach(enableFeature)

  it('serves a published plan at its CURRENT Official version', async () => {
    const { plan, version } = await makePlanWithOfficial('Resolvable')
    const published = (await publish(plan.id, { visibility: 'listed' })) as LessonPlan

    const result = await resolvePublicPlanBySlug(fx.payload, published.publicSlug as string)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.id).toBe(plan.id)
    expect(result.version.id, 'the served version is the plan’s Official one').toBe(version.id)
  })

  it('serves an unlisted plan too — it is reachable by link, just not browsable', async () => {
    const { plan } = await makePlanWithOfficial('Unlisted but reachable')
    const published = (await publish(plan.id, { visibility: 'unlisted' })) as LessonPlan

    const result = await resolvePublicPlanBySlug(fx.payload, published.publicSlug as string)
    expect(result.ok).toBe(true)
  })

  /** GATE 1 — the deployment switch. An offline installation serves nothing, whatever the data says. */
  it('resolves NOTHING when public discovery is disabled, even for a published plan', async () => {
    const { plan } = await makePlanWithOfficial('Disabled deployment')
    const published = (await publish(plan.id, { visibility: 'listed' })) as LessonPlan

    disableFeature()
    const result = await resolvePublicPlanBySlug(fx.payload, published.publicSlug as string)
    expect(result).toEqual({ ok: false, reason: 'feature-disabled' })
  })

  /** GATE 3 — publication is deliberate. A private plan is not public merely for having a slug. */
  it('refuses a PRIVATE plan that still carries a slug from an earlier publication', async () => {
    const { plan } = await makePlanWithOfficial('Withdrawn')
    const published = (await publish(plan.id, { visibility: 'listed' })) as LessonPlan
    const slug = published.publicSlug as string

    await publish(plan.id, { visibility: 'private' })

    const result = await resolvePublicPlanBySlug(fx.payload, slug)
    expect(result, 'unpublishing must actually withdraw it').toEqual({ ok: false, reason: 'not-public' })
  })

  /** GATE 2 — an unknown slug is a miss, not an error and not a hint. */
  it.each(['no-such-plan', '', '   '])('refuses the unknown slug %o', async (slug) => {
    const result = await resolvePublicPlanBySlug(fx.payload, slug)
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  /**
   * GATE 4 — Official is required, and it is the ONLY version reachable. A published plan whose
   * pointer is absent serves nothing rather than falling back to any other retained version; those
   * are editors' working copies and must never be public.
   */
  it('refuses a published plan with no Official version rather than falling back', async () => {
    const { plan } = await makePlanWithOfficial('Pointerless')
    const published = (await publish(plan.id, { visibility: 'listed' })) as LessonPlan

    // Cleared on a SYSTEM path (no req.user), the carve-out validateOfficialVersionPointer allows.
    await fx.payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { officialVersion: null } as never,
      overrideAccess: true,
    })

    const result = await resolvePublicPlanBySlug(fx.payload, published.publicSlug as string)
    expect(result).toEqual({ ok: false, reason: 'no-official-version' })
  })

  /**
   * ⚑ The independence rule, stated as an executable claim: a second, NEWER version existing under a
   * published plan changes nothing until the Official pointer moves. This is what stops an editor's
   * unsaved-in-spirit working copy from appearing on the public internet the moment it is saved.
   */
  it('keeps serving the Official version when a newer non-Official version exists', async () => {
    const { plan, version } = await makePlanWithOfficial('Newer draft exists')
    const published = (await publish(plan.id, { visibility: 'listed' })) as LessonPlan

    const draft = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.1',
        title: `${MARK}Newer draft exists v1.0.1`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as LessonBundleVersion

    const result = await resolvePublicPlanBySlug(fx.payload, published.publicSlug as string)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.version.id, 'the newer working copy must NOT be served').not.toBe(draft.id)
    expect(result.version.id).toBe(version.id)
  })
})
