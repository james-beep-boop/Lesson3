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
    const wc = await makeWorkingCopy()
    const submitted = minimalBundleContent()
    submitted.lessons[0].overview = 'EDITOR-EDITED overview' // prose → should persist
    submitted.meta.substrand_name = 'EDITOR-HACKED meta' // admin-only → should be preserved

    const updated = (await fx.payload.update({
      collection: 'lesson-bundle-versions',
      id: wc.id,
      data: { ...submitted } as never,
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
