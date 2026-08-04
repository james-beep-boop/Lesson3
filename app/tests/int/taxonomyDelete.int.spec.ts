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

  /**
   * The fixture subject-grade's `subject` as a plain id.
   *
   * Narrowed inline rather than through `toId`, and WITHOUT `as never`. `toId` is typed for a
   * subject-GRADE reference (`number | SubjectGrade`); this is a SUBJECT reference
   * (`number | Subject`) — structurally different types, which is exactly what the cast was hiding.
   * Same two-branch narrowing `SubjectGrade.beforeChange` uses on this field, and `subject` is
   * non-nullable in the generated type so there is no null case.
   *
   * ⚑ Shared by both cases below on purpose. A previous pass fixed the UPDATE occurrence and left its
   * twin in CREATE two functions away — the reviewed line got fixed, the problem did not. One helper
   * makes that impossible to repeat here.
   *
   * NOT a repo-wide cleanup: `toId(x as never)` appears in ~30 places under `src/`, because `toId` is
   * typed for one relationship shape and used on many. Generalising it is the real fix and belongs
   * with that helper, not in a test — recorded as a follow-up.
   */
  const fixtureSubjectId = () => {
    const s = fx.subjectGrade.subject
    return typeof s === 'object' ? s.id : s
  }

  it('rejects a duplicate (subject, grade) on CREATE with a 400 naming the clash', async () => {
    // The fixture's subject-grade already occupies (fixture subject, its grade).
    const sg = fx.subjectGrade
    let caught: unknown
    try {
      await fx.payload.create({
        collection: 'subject-grades',
        data: { subject: fixtureSubjectId(), grade: sg.grade },
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
    // ⚑ "Legitimate MOVE" means a successful UPDATE. An earlier version of this test only did a
    // successful CREATE and then a rejected update, so the name overclaimed: the guard could have been
    // rejecting every update — including valid ones — and this test would still have passed. The
    // free-grade update below is what actually earns the second half of the name.
    const sg = fx.subjectGrade
    const subjectId = fixtureSubjectId()
    const base = sg.grade ?? 10
    const row = await fx.payload.create({
      collection: 'subject-grades',
      data: { subject: subjectId, grade: base + 41 },
      overrideAccess: true,
    })
    expect(row.displayName, 'displayName is maintained on create').toContain(`Grade ${base + 41}`)

    // A legitimate move: another free grade on the same subject. Must SUCCEED, and must re-derive the
    // stored title — the beforeChange hook is the only thing keeping `displayName` true.
    const legit = await fx.payload.update({
      collection: 'subject-grades',
      id: row.id,
      data: { grade: base + 42 },
      overrideAccess: true,
    })
    expect(legit.grade, 'a free grade must be accepted').toBe(base + 42)
    expect(legit.displayName, 'displayName follows the new grade').toContain(`Grade ${base + 42}`)

    // The state the rejected update below must leave completely untouched.
    const before = await fx.payload.findByID({
      collection: 'subject-grades',
      id: row.id,
      overrideAccess: true,
    })

    // Now move it onto the OCCUPIED pair — must be refused, readably.
    let caught: unknown
    try {
      await fx.payload.update({
        collection: 'subject-grades',
        id: row.id,
        data: { grade: sg.grade },
        overrideAccess: true,
      })
    } catch (e) {
      caught = e
    }
    expect(messageOf(caught)).toBe(`Grade ${sg.grade} already exists for that subject.`)
    expect(statusOf(caught)).toBe(400)

    // …and the refusal left the row alone — the WHOLE row, not just the field the update named.
    // Checking only `grade` would miss a partial write to a DERIVED field: `displayName` is rebuilt by
    // `beforeChange`, which runs after `beforeValidate`, so "the guard threw but the title already
    // moved" is a shape worth excluding rather than assuming. Captured before, compared after.
    const after = await fx.payload.findByID({
      collection: 'subject-grades',
      id: row.id,
      overrideAccess: true,
    })
    expect(
      { grade: after.grade, subject: after.subject, displayName: after.displayName },
      'a rejected update must not partially apply — including derived fields',
    ).toEqual({ grade: before.grade, subject: before.subject, displayName: before.displayName })

    // ⚑ THE case the self-exclusion exists for: re-saving a row WITHOUT changing (subject, grade).
    // The row then clashes with ITSELF, and only `clash.id !== originalDoc?.id` keeps the save legal —
    // so an operator opening a subject-grade and pressing Save would be refused without it.
    //
    // Added after checking whether the tests above could see that: they could NOT. Deleting the
    // self-exclusion left all of them green, because every "legitimate" update they perform moves to a
    // FREE grade, where no clash is found and the exclusion never runs. A successful update is not the
    // same test as a successful *self*-colliding update.
    const resaved = await fx.payload.update({
      collection: 'subject-grades',
      id: row.id,
      data: { grade: base + 42 },
      overrideAccess: true,
    })
    expect(resaved.grade, 'an unchanged re-save must be allowed').toBe(base + 42)

    await fx.payload.delete({ collection: 'subject-grades', id: row.id, overrideAccess: true })
  })
})
