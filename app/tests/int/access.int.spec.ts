/**
 * Access-control integration tests (Local API), CI-gateable port of the coverage previously living
 * only in `scripts/verify-rbac.ts` + `scripts/verify-stage2b-edit.ts`. Drives Payload's Local API
 * with `overrideAccess: false` + an explicit `user`, exercising the real collection access functions
 * and hooks (SPEC §5/§8):
 *
 *   - ALL saved versions are immutable to authenticated users — `enforceVersionImmutable` (beforeChange)
 *     rejects every authenticated in-place update; authoring a change goes through save-as-new (a
 *     create, covered over HTTP). `update` ACCESS is permissive only so the admin edit form renders
 *     editable; the immutability guarantee is the hook. Trusted system paths (overrideAccess, no user)
 *     may still write in place (ingest/migrations).
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

/** Create a Not-Official working copy of the fixture plan via the Local API (system path).
 *  `author` (optional) stamps authorship — the system create may set it (field access is bypassed). */
async function makeWorkingCopy(semver = '1.0.1', author?: number) {
  return fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver,
      sourceVersion: fx.version.id,
      title: `${MARK}WorkingCopy`,
      ...(author != null ? { author } : {}),
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })
}

describe('version immutability (Stage 2 model: no in-place updates)', () => {
  it('rejects an authenticated update of the Official version (even Site Admin)', async () => {
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

  it('rejects an authenticated update of a NON-Official candidate too (any role)', async () => {
    // In-place edits are gone: authoring a change goes through save-as-new (a new candidate), so even a
    // Subject Admin cannot mutate an existing candidate row directly — `enforceVersionImmutable`
    // (beforeChange) rejects it. Only trusted system paths (overrideAccess, no user) write.
    const wc = await makeWorkingCopy()
    await expect(
      fx.payload.update({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        data: { title: 'in-place edit' } as never,
        overrideAccess: false,
        user: fx.users.subjectAdmin,
      }),
    ).rejects.toThrow()
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })

  it('still allows trusted system (overrideAccess) updates — ingest/migrations rely on this', async () => {
    const wc = (await makeWorkingCopy()) as { id: number | string }
    await expect(
      fx.payload.update({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        data: { title: `${MARK}sys-update` } as never,
        overrideAccess: true,
      }),
    ).resolves.toBeTruthy()
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })
})

describe('version deletion scope (authorship — IA redesign 2026-07-01)', () => {
  it('Editor CAN delete a non-Official candidate they authored', async () => {
    const wc = await makeWorkingCopy('2.0.1', fx.users.editor.id)
    await expect(
      fx.payload.delete({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        overrideAccess: false,
        user: fx.users.editor,
      }),
    ).resolves.toBeTruthy()
  })

  it('Editor CANNOT delete an AUTHORLESS candidate (pre-authorship → admin-only)', async () => {
    const wc = await makeWorkingCopy('2.0.2')
    await expect(
      fx.payload.delete({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        overrideAccess: false,
        user: fx.users.editor,
      }),
    ).rejects.toThrow()
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })

  it("Editor CANNOT delete another user's candidate", async () => {
    const wc = await makeWorkingCopy('2.0.3', fx.users.subjectAdmin.id)
    await expect(
      fx.payload.delete({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        overrideAccess: false,
        user: fx.users.editor,
      }),
    ).rejects.toThrow()
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })

  it('Subject Admin CAN delete any candidate in scope, authorless included', async () => {
    const wc = await makeWorkingCopy('2.0.4')
    await expect(
      fx.payload.delete({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        overrideAccess: false,
        user: fx.users.subjectAdmin,
      }),
    ).resolves.toBeTruthy()
  })
})

// NOTE: the Editor prose-only field-split and the stale-source guard now live on the save-as-new write
// path (POST /:id/save-as-new), not an in-place update — so they're covered over HTTP in
// tests/http/endpoints.http.spec.ts, not here.

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

  it('#3b semver (and every field) is server-immutable — authenticated updates are rejected', async () => {
    // Stage 2 model: no in-place updates at all, so an authenticated attempt to mutate identity (semver)
    // is rejected outright (rather than silently preserved). Changes go through save-as-new.
    const wc = await makeWorkingCopy()
    await expect(
      fx.payload.update({
        collection: 'lesson-bundle-versions',
        id: wc.id,
        data: { semver: '7.7.7' } as never,
        overrideAccess: false,
        user: fx.users.siteAdmin,
      }),
    ).rejects.toThrow()
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: wc.id, overrideAccess: true })
  })

  it('sourceVersion is system-only: an authenticated create cannot set it (stripped, not stored)', async () => {
    // Provenance is stamped by save-as-new (overrideAccess), never taken from a caller — field access
    // is create/update systemOnly, so a spoofed value on a direct admin create is silently stripped.
    // The system path setting it is exercised by makeWorkingCopy above.
    const v = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '9.2.0',
        sourceVersion: fx.version.id, // spoof attempt
        title: `${MARK}src-spoof`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: false,
      user: fx.users.subjectAdmin,
    })) as { id: number | string }
    const stored = (await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: v.id,
      depth: 0,
      overrideAccess: true,
    })) as { sourceVersion?: unknown }
    expect(stored.sourceVersion ?? null).toBeNull()
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v.id, overrideAccess: true })
  })

  it('semver is system-only on CREATE too: a forged value is stripped → 1.0.0 default (audit 2026-07-06)', async () => {
    // A privileged direct create previously accepted any semver ("banana", "999.0.0"), corrupting
    // ordering and future bump allocation. Field access is now create+update systemOnly, so an
    // authenticated create has the submitted value stripped and the 1.0.0 default applied. Fresh
    // throwaway plan (the fixture plan already has a 1.0.0 — the unique index would reject).
    const p = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}semver-forge-plan`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })
    const v = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: p.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '999.0.0', // forge attempt
        title: `${MARK}semver-forge`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: false,
      user: fx.users.subjectAdmin,
    })) as { id: number | string; semver?: string }
    expect(v.semver).toBe('1.0.0')
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v.id, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-plans', id: p.id, overrideAccess: true })
  })

  it('semver validate rejects non-x.y.z even on the system path', async () => {
    // Defense-in-depth behind the field access: nextSemverForPlan parses malformed pieces loosely,
    // so garbage must never land — not even via overrideAccess (which bypasses access, not validation).
    await expect(
      fx.payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          lessonPlan: fx.plan.id,
          subjectGrade: fx.subjectGrade.id,
          semver: 'banana',
          title: `${MARK}semver-banana`,
          ...minimalBundleContent(),
        } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
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

  it('deleting a lesson plan cascades its versions (incl. the Official one) — no 23502', async () => {
    // Regression: `lesson_bundle_versions.lesson_plan_id` is NOT NULL but its FK is ON DELETE SET NULL,
    // so a plan with surviving child versions could not be deleted — Postgres raised 23502, surfaced in
    // the admin UI as "An unknown error has occurred." The beforeDelete cascade removes the children
    // (the Official one's retention guard stands down because the plan is going away).
    const p = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}cascade-plan`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })
    const official = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: p.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.0',
        title: `${MARK}cascade-official`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as { id: number | string }
    const candidate = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: p.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.1',
        title: `${MARK}cascade-candidate`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as { id: number | string }
    await fx.payload.update({
      collection: 'lesson-plans',
      id: p.id,
      data: { officialVersion: official.id } as never,
      overrideAccess: true,
    })

    // The real admin delete path (the one the user hit): Site Admin, access enforced. Must succeed.
    await expect(
      fx.payload.delete({
        collection: 'lesson-plans',
        id: p.id,
        overrideAccess: false,
        user: fx.users.siteAdmin,
      }),
    ).resolves.toBeTruthy()

    // Both child versions are gone — neither orphaned with a null lesson_plan_id.
    for (const id of [official.id, candidate.id]) {
      await expect(
        fx.payload.findByID({ collection: 'lesson-bundle-versions', id, overrideAccess: true }),
      ).rejects.toThrow()
    }
  })

  it('the Official-version retention guard still blocks a direct delete (cascade carve-out is scoped)', async () => {
    // The context carve-out only applies while the parent plan is being deleted. Deleting the Official
    // version on its own (plan untouched) must still be rejected — it would orphan the plan pointer.
    const p = await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: `${MARK}guard-plan`, subjectGrade: fx.subjectGrade.id } as never,
      overrideAccess: true,
    })
    const v = (await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: p.id,
        subjectGrade: fx.subjectGrade.id,
        semver: '1.0.0',
        title: `${MARK}guard-official`,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })) as { id: number | string }
    await fx.payload.update({
      collection: 'lesson-plans',
      id: p.id,
      data: { officialVersion: v.id } as never,
      overrideAccess: true,
    })

    await expect(
      fx.payload.delete({ collection: 'lesson-bundle-versions', id: v.id, overrideAccess: true }),
    ).rejects.toThrow()

    // Cleanup: clear the pointer, then the version, then the plan (the system teardown order).
    await fx.payload.update({
      collection: 'lesson-plans',
      id: p.id,
      data: { officialVersion: null } as never,
      overrideAccess: true,
    })
    await fx.payload.delete({ collection: 'lesson-bundle-versions', id: v.id, overrideAccess: true })
    await fx.payload.delete({ collection: 'lesson-plans', id: p.id, overrideAccess: true })
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

  it("Subject Admin cannot change a Site Admin's assignment rows (Codex round-3 #2)", async () => {
    // roles is field-hidden from Subject Admins, so the SERVER owns this rule (enforceAssignmentScope)
    // for every write path — a stale/hostile client cannot add an Editor row to a Site Admin.
    await expect(
      fx.payload.update({
        collection: 'users',
        id: fx.users.siteAdmin.id,
        data: { assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }] },
        overrideAccess: false,
        user: fx.users.subjectAdmin,
      }),
    ).rejects.toThrow()
    const unchanged = (await fx.payload.findByID({
      collection: 'users',
      id: fx.users.siteAdmin.id,
      depth: 0,
      overrideAccess: true,
    })) as { assignments?: unknown[] }
    expect(unchanged.assignments ?? []).toHaveLength(0)
  })

  it('directory reads: every authenticated user gets the names-only roster', async () => {
    // SPEC §8 as amended 2026-07-02 (with PR ③ messaging): the 2026-07-01 self-only tightening
    // was DELIBERATELY relaxed at the collection level — the messaging user picker needs the
    // roster. What keeps it names-only is field access; the field-stripping matrix (email /
    // roles / assignments hidden from non-admins) is pinned in tests/int/messages.int.spec.ts.
    for (const reader of [fx.users.teacher, fx.users.editor, fx.users.subjectAdmin]) {
      const { docs } = await fx.payload.find({
        collection: 'users',
        where: { name: { like: MARK } },
        overrideAccess: false,
        user: reader,
        depth: 0,
      })
      // The whole fixture roster (all four seeded users), whatever the reader's own role.
      expect(docs.length).toBe(4)
    }
  })
})
