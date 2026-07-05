/**
 * Taxonomy delete-guard integration tests (audit 2026-07-04, Phase 2 invariant tripwires).
 *
 * `lesson_plans` / `lesson_bundle_versions` / `users_assignments` all carry a NOT NULL
 * `subject_grade_id` with an ON DELETE SET NULL FK, and `subject_grades.subject_id` is the same
 * shape — so deleting a referenced SubjectGrade/Subject used to raise an opaque Postgres 23502
 * ("An unknown error has occurred"). The guards (collections/SubjectGrade + Subject) now:
 *   - BLOCK on referenced content (lesson plans / versions) with an actionable 409,
 *   - CASCADE dangling role assignments off their holders,
 *   - BLOCK a Subject delete while it still has SubjectGrades.
 *
 * Requires a DB → Rock only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures.js'
import { toId } from '../../src/access/index.js'

let fx: RoleFixture

beforeAll(async () => {
  fx = await setupRoleFixture()
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('SubjectGrade delete guard', () => {
  it('blocks deletion while lesson plans reference it (actionable, not 23502)', async () => {
    // The fixture SubjectGrade has the fixture plan + its Official version.
    await expect(
      fx.payload.delete({
        collection: 'subject-grades',
        id: fx.subjectGrade.id,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/lesson plan/i)
  })

  it('blocks the parent Subject delete while it still has SubjectGrades', async () => {
    await expect(
      fx.payload.delete({ collection: 'subjects', id: fx.subject.id, overrideAccess: true }),
    ).rejects.toThrow(/subject grade/i)
  })

  it('cascades dangling role assignments, then deletes cleanly once content is gone', async () => {
    // A fresh, content-free SubjectGrade with an editor assigned to it.
    const sg = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: fx.subject.id, grade: 98 },
      overrideAccess: true,
    })
    const holder = await fx.payload.create({
      collection: 'users',
      data: {
        name: `${MARK}sgDeleteEditor`,
        email: `${MARK.toLowerCase()}sgdel@example.com`,
        password: 'test1234',
        assignments: [{ subjectGrade: sg.id, role: 'editor' }],
      } as never,
      overrideAccess: true,
    })

    await fx.payload.delete({ collection: 'subject-grades', id: sg.id, overrideAccess: true })

    // The assignment row to the now-gone SG is cascaded off the holder (not left dangling).
    const after = await fx.payload.findByID({
      collection: 'users',
      id: holder.id,
      depth: 0,
      overrideAccess: true,
    })
    expect((after.assignments ?? []).some((a) => toId(a.subjectGrade) === sg.id)).toBe(false)
  })
})
