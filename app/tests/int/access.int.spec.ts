/**
 * Access-control integration tests (Local API), CI-gateable port of the coverage previously living
 * only in `scripts/verify-rbac.ts` + `scripts/verify-stage2b-edit.ts`. Drives Payload's Local API
 * with `overrideAccess: false` + an explicit `user`, exercising the real collection access functions
 * and beforeChange hooks (SPEC §5/§8):
 *
 *   - Official versions are immutable (any role) — `enforceVersionImmutable`.
 *   - A Not-Official working copy is mutable; the Editor field-split whitelist constrains an Editor
 *     to prose values (admin/structure fields preserved, array cardinality changes rejected).
 *   - Teachers cannot create or update versions.
 *   - ≤1 Subject Admin per SubjectGrade (auto-demote on promotion).
 *   - Password guard: only self or Site Admin; Subject Admin may still manage assignments.
 *
 * Requires a DB → Rock only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { relId } from '../../src/lib/relId.js'
import { nextSemverForPlan } from '../../src/lib/semver.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

/** Create a Not-Official working copy of the fixture plan via the Local API (system path). */
async function makeWorkingCopy() {
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.0.1',
      sourceVersion: fx.version.id,
      title: `${MARK}WorkingCopy`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })
}

describe('version immutability', () => {
  it('rejects updating the Official version even for a Site Admin', async () => {
    await expect(
      fx.payload.update({
        collection: 'lesson-bundle-versions',
        id: fx.version.id,
        data: { title: 'changed' } as never,
        overrideAccess: false,
        user: fx.users.siteAdmin,
      }),
    ).rejects.toThrow()
  })
})

describe('Editor field-split on a working copy', () => {
  it('lets an Editor overlay prose but preserves admin/structure fields', async () => {
    const wc = (await makeWorkingCopy()) as any
    // Resubmit the working copy's REAL rows (with their ids + admin fields like `phase`), mirroring
    // the live edit path (`verify-stage2b-edit`). A fresh minimalBundleContent() has no row ids, so
    // Payload treats each as a NEW row and strips the admin-only `phase` — which then fails the
    // generatable gate before the field-split can restore it (i.e. it tests the wrong thing).
    const lessons = (wc.lessons ?? []).map((l: any, i: number) =>
      i === 0 ? { ...l, overview: 'EDITOR-EDITED overview' } : l, // prose → should persist
    )

    const updated = (await fx.payload.update({
      collection: 'lesson-bundle-versions',
      id: wc.id,
      // meta is admin-only → the hacked substrand_name must be ignored (preserved from the original).
      data: { lessons, meta: { ...wc.meta, substrand_name: 'EDITOR-HACKED meta' } } as never,
      overrideAccess: false,
      user: fx.users.editor,
    })) as any

    expect(updated.lessons[0].overview).toBe('EDITOR-EDITED overview')
    expect(updated.meta.substrand_name).toBe(`${MARK}Sub-strand`) // original, not the hack

    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })

  it('rejects an Editor changing lesson array cardinality', async () => {
    const wc = await makeWorkingCopy()
    const submitted = minimalBundleContent()
    submitted.lessons.push({ ...submitted.lessons[0], title: `${MARK}extra` }) // add a row

    await expect(
      fx.payload.update({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        data: { ...submitted } as never,
        overrideAccess: false,
        user: fx.users.editor,
      }),
    ).rejects.toThrow()

    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })
})

describe('Teacher cannot write versions', () => {
  it('rejects a Teacher creating a version', async () => {
    await expect(
      fx.payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          lessonPlan: fx.plan.id,
          subjectGrade: fx.subjectGrade.id,
          title: `${MARK}teacher-create`,
          ...minimalBundleContent(),
        } as never,
        overrideAccess: false,
        user: fx.users.teacher,
      }),
    ).rejects.toThrow()
  })

  it('rejects a Teacher updating a working copy', async () => {
    const wc = await makeWorkingCopy()
    await expect(
      fx.payload.update({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        data: { title: 'teacher-was-here' } as never,
        overrideAccess: false,
        user: fx.users.teacher,
      }),
    ).rejects.toThrow()
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })
})

describe('Server-side invariants (Bucket A)', () => {
  it('#2 rejects an authenticated update that clears the Official pointer; system clear is allowed', async () => {
    // Throwaway plan + its OWN Official version, assembled the only legal way: create the plan, create
    // the version UNDER it, then point the pointer at it via update (the two-phase ingest order). A
    // cross-plan pointer (version owned by a different plan) is structurally invalid — see the create
    // guard spec below.
    const p = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}inv2-plan`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })
    const v = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: p.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '9.0.0',
        title: `${MARK}inv2`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as any
    await fx.payload.update({
      collection: 'lesson-plans',
      id: p.id,
      data: { officialVersion: v.id } as never,
      overrideAccess: true,
    })

    // Authenticated Site Admin clearing officialVersion → rejected.
    await expect(
      fx.payload.update({
        collection: 'lesson-plans',
        id: p.id,
        data: { officialVersion: null } as never,
        overrideAccess: false,
        user: fx.users.siteAdmin,
      }),
    ).rejects.toThrow()

    // System path (overrideAccess, no user) may still clear it — teardown/cleanup relies on this.
    await expect(
      fx.payload.update({
        collection: 'lesson-plans',
        id: p.id,
        data: { officialVersion: null } as never,
        overrideAccess: true,
      }),
    ).resolves.toBeTruthy()

    // Version `v` lives UNDER `p` (NOT NULL lesson_plan_id) → delete the child version before its
    // plan, or the plan-delete's relationship-null violates the constraint.
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v.id, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-plans', id: p.id, overrideAccess: true })
  })

  it('#2 rejects an authenticated CREATE that sets the Official pointer (two-phase only)', async () => {
    // On create the plan does not exist yet, so any officialVersion is structurally invalid — and the
    // ownership ("version belongs to this plan") check can't run (no originalDoc), which is exactly the
    // gap this guard closes. Point at the fixture's real (same-grade) version so only the create guard,
    // not the grade check, can be doing the rejecting.
    await expect(
      fx.payload.create({
        collection: 'lesson-plans',
        data: {
          title: `${MARK}inv2-create`,
          subjectGrade: fx.subjectGrade.id,
          officialVersion: fx.version.id,
        } as never,
        overrideAccess: false,
        user: fx.users.siteAdmin,
      }),
    ).rejects.toThrow()

    // The system/ingest path (overrideAccess, no user) is exempt — but it still never sets the pointer
    // on create; it creates the plan pointer-less, then sets it via update (the fixture proves this).
    const sys = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}inv2-create-sys`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })
    expect(sys.officialVersion ?? null).toBeNull()
    await fx.payload.delete({ collection: 'lesson-plans', id: sys.id, overrideAccess: true })
  })

  it('#3a rejects a version whose subjectGrade differs from its plan', async () => {
    // A second subject-grade under the same subject (grade 98 ≠ the fixture's 99).
    const otherSg = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: fx.subject.id, grade: 98 } as never,
      overrideAccess: true,
    })
    await expect(
      fx.payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          lessonPlan: fx.plan.id, // plan is grade 99
          subjectGrade: otherSg.id, // mismatch → reject
          semver: '9.1.0',
          title: `${MARK}inv3a`,
          ...minimalBundleContent(),
        } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
    await fx.payload.delete({ collection: 'subject-grades', id: otherSg.id, overrideAccess: true })
  })

  it('#3b semver is server-immutable on an authenticated update', async () => {
    const wc = (await makeWorkingCopy()) as any
    const updated = (await fx.payload.update({
      collection: 'lesson-bundle-versions',
      id: wc.id,
      data: { semver: '7.7.7' } as never, // attempt to mutate identity
      overrideAccess: false,
      user: fx.users.siteAdmin,
    })) as any
    expect(updated.semver).toBe(wc.semver) // unchanged, not '7.7.7'
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })

  it('#4 nextSemverForPlan returns the next free patch across the plan (not a blind source bump)', async () => {
    // Fixture plan already has its Official 1.0.0; add a 1.0.1, then the next free patch is 1.0.2.
    const v101 = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.1',
        title: `${MARK}inv4`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as any
    const next = await nextSemverForPlan(fx.payload, fx.plan.id)
    expect(next).toBe('1.0.2')
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v101.id, overrideAccess: true })
  })

  it('#4 the unique (lessonPlan, semver) index rejects a duplicate semver on the same plan', async () => {
    const mk = (semver: string) =>
      fx.payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          lessonPlan: fx.plan.id,
          subjectGrade: fx.subjectGrade.id,
          semver,
          title: `${MARK}dup-${semver}`,
          ...minimalBundleContent(),
        } as never,
        overrideAccess: true,
      })
    const first = (await mk('5.5.5')) as any
    await expect(mk('5.5.5')).rejects.toThrow() // same (plan, semver) → unique-index violation
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: first.id, overrideAccess: true })
  })
})

describe('People rules (SPEC §8)', () => {
  it('keeps ≤1 Subject Admin per SubjectGrade (fixture editor was auto-demote-safe)', async () => {
    // Promote the fixture Editor to subjectAdmin → the existing subjectAdmin must be demoted.
    await fx.payload.update({
      collection: 'users',
      id: fx.users.editor.id,
      data: { assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'subjectAdmin' }] },
      overrideAccess: true,
    })
    const prior = await fx.payload.findByID({ collection: 'users', id: fx.users.subjectAdmin.id, depth: 0 })
    const priorRole = (prior.assignments ?? []).find(
      (a) => relId(a.subjectGrade) === fx.subjectGrade.id,
    )?.role
    expect(priorRole).toBe('editor')

    // Restore the fixture state for any later specs.
    await fx.payload.update({
      collection: 'users',
      id: fx.users.subjectAdmin.id,
      data: { assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'subjectAdmin' }] },
      overrideAccess: true,
    })
    await fx.payload.update({
      collection: 'users',
      id: fx.users.editor.id,
      data: { assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }] },
      overrideAccess: true,
    })
  })

  it('blocks a Subject Admin from changing another user password', async () => {
    await expect(
      fx.payload.update({
        collection: 'users',
        id: fx.users.editor.id,
        data: { password: 'hacked' },
        overrideAccess: false,
        user: fx.users.subjectAdmin,
      }),
    ).rejects.toThrow()
  })

  it('lets a Subject Admin manage assignments in their SubjectGrade', async () => {
    await expect(
      fx.payload.update({
        collection: 'users',
        id: fx.users.editor.id,
        data: { assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }] },
        overrideAccess: false,
        user: fx.users.subjectAdmin,
      }),
    ).resolves.toBeTruthy()
  })
})
