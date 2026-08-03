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

import {
  MARK,
  createUserVerified,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
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
    const holder = await createUserVerified(fx.payload, {
      name: `${MARK}sgDeleteEditor`,
      email: `${MARK.toLowerCase()}sgdel@example.com`,
      password: 'test1234',
      assignments: [{ subjectGrade: sg.id, role: 'editor' }],
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

/**
 * The duplicate-(subject, grade) guard must surface a READABLE message, not a 500.
 *
 * `SubjectGrade.beforeValidate` exists for exactly one reason — the compound unique index is the real
 * guarantee, and the hook is there so an operator sees "Grade 10 already exists for that subject."
 * instead of an opaque constraint violation. It threw a bare `Error`, which Payload treats as an
 * unexpected fault: logged at error level, returned as a generic **500 "Something went wrong."** So
 * the hook produced an opaque failure of its own, and did so for its whole life.
 *
 * Pinned here because that regression is invisible: the guard still BLOCKS correctly either way, so
 * every behavioural test passes while the message the hook exists to deliver never arrives. The only
 * observable difference is the status code and the string.
 *
 * Found 2026-08-03 while chasing an operator report of a "stale subject" on this form. That report is
 * still unreproduced, but this is the most likely thing behind it: the save fails with no explanation,
 * Payload keeps the submitted values, and a form that will not save while showing the values you typed
 * reads exactly like a value that is stuck.
 */
describe('SubjectGrade duplicate guard surfaces a readable error', () => {
  /** Payload's APIError carries `status`; a bare Error would arrive as 500 with a generic message. */
  const statusOf = (e: unknown) => (e as { status?: number } | null)?.status
  const messageOf = (e: unknown) => (e as { message?: string } | null)?.message

  it('rejects a duplicate (subject, grade) on CREATE with a 400 naming the clash', async () => {
    // The fixture's subject-grade already occupies (fixture subject, its grade).
    const sg = fx.subjectGrade
    let caught: unknown
    try {
      await fx.payload.create({
        collection: 'subject-grades',
        data: { subject: toId(sg.subject as never) ?? sg.subject, grade: sg.grade },
        overrideAccess: true,
      })
    } catch (e) {
      caught = e
    }
    expect(caught, 'a duplicate (subject, grade) must be rejected').toBeDefined()
    expect(messageOf(caught)).toBe(`Grade ${sg.grade} already exists for that subject.`)
    expect(statusOf(caught), 'must be a 400 APIError, not an unexplained 500').toBe(400)
  })

  it('rejects a duplicate on UPDATE too, and still allows a legitimate move', async () => {
    const sg = fx.subjectGrade
    const subjectId = toId(sg.subject as never) ?? sg.subject
    // A second row on the same subject at a free grade — legitimate, must succeed.
    const moved = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: subjectId, grade: (sg.grade ?? 10) + 41 },
      overrideAccess: true,
    })
    expect(moved.displayName, 'displayName is maintained on create').toContain(
      `Grade ${(sg.grade ?? 10) + 41}`,
    )

    // Now move it onto the occupied pair — must be refused, readably.
    let caught: unknown
    try {
      await fx.payload.update({
        collection: 'subject-grades',
        id: moved.id,
        data: { grade: sg.grade },
        overrideAccess: true,
      })
    } catch (e) {
      caught = e
    }
    expect(messageOf(caught)).toBe(`Grade ${sg.grade} already exists for that subject.`)
    expect(statusOf(caught)).toBe(400)

    await fx.payload.delete({ collection: 'subject-grades', id: moved.id, overrideAccess: true })
  })
})
